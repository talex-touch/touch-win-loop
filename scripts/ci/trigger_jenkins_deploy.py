#!/usr/bin/env python3

from __future__ import annotations

import base64
import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass


def to_text(value: object) -> str:
  return str(value or '').strip()


def require_env(name: str) -> str:
  value = to_text(os.environ.get(name))
  if not value:
    raise SystemExit(f'Missing required environment variable: {name}')
  return value


@dataclass(frozen=True)
class DeployTarget:
  environment: str
  job_name: str


def resolve_deploy_target(branch: str, staging_job: str, production_job: str) -> DeployTarget | None:
  if branch == 'dev':
    return DeployTarget(environment='staging', job_name=staging_job)
  if branch == 'main':
    return DeployTarget(environment='prod', job_name=production_job)
  return None


def job_path(name: str) -> str:
  parts = [part for part in name.strip('/').split('/') if part]
  return ''.join(f"/job/{urllib.parse.quote(part, safe='')}" for part in parts)


def api_url(url: str, suffix: str = 'api/json') -> str:
  normalized = url if url.endswith('/') else f'{url}/'
  return urllib.parse.urljoin(normalized, suffix)


def request_json(url: str, headers: dict[str, str]) -> dict:
  request = urllib.request.Request(url, headers=headers)
  with urllib.request.urlopen(request, timeout=30) as response:
    return json.load(response)


def fetch_crumb_headers(base_url: str, default_headers: dict[str, str]) -> dict[str, str]:
  crumb_url = f'{base_url}/crumbIssuer/api/json'
  try:
    crumb_payload = request_json(crumb_url, default_headers)
  except urllib.error.HTTPError as exc:
    if exc.code not in (401, 403, 404):
      raise
    crumb_payload = {}
  except urllib.error.URLError:
    crumb_payload = {}

  crumb_field = to_text(crumb_payload.get('crumbRequestField'))
  crumb_value = to_text(crumb_payload.get('crumb'))
  if crumb_field and crumb_value:
    print(f'Fetched Jenkins crumb via {crumb_field}.')
    return {crumb_field: crumb_value}

  print('Jenkins crumb issuer is unavailable or not required, continue without crumb header.')
  return {}


def trigger_jenkins_queue(*,
  base_url: str,
  default_headers: dict[str, str],
  crumb_headers: dict[str, str],
  job_name: str,
  repository: str,
  branch: str,
  commit_sha: str,
  build_version: str,
  image_ref: str,
  triggered_by: str,
  workflow_run_url: str,
) -> str:
  params = urllib.parse.urlencode({
    'GITHUB_REPOSITORY': repository,
    'GITHUB_BRANCH': branch,
    'BUILD_COMMIT_SHA': commit_sha,
    'BUILD_VERSION': build_version,
    'IMAGE_REF': image_ref,
    'TRIGGERED_BY': triggered_by,
    'WORKFLOW_RUN_URL': workflow_run_url,
  }).encode('utf-8')
  headers = dict(default_headers)
  headers.update(crumb_headers)
  headers['Content-Type'] = 'application/x-www-form-urlencoded'
  trigger_url = f'{base_url}{job_path(job_name)}/buildWithParameters'
  request = urllib.request.Request(trigger_url, data=params, headers=headers, method='POST')

  with urllib.request.urlopen(request, timeout=30) as response:
    location = to_text(response.headers.get('Location'))
    status = response.getcode()

  if status not in (200, 201, 202):
    raise SystemExit(f'Unexpected Jenkins trigger status: {status}')
  if not location:
    raise SystemExit('Jenkins trigger did not return a queue location header')
  return f'{base_url}{location}' if location.startswith('/') else location


def wait_for_build_start(*, queue_url: str, headers: dict[str, str], timeout_seconds: int = 15 * 60) -> str:
  deadline = time.time() + timeout_seconds
  while time.time() < deadline:
    queue_payload = request_json(api_url(queue_url), headers)
    if queue_payload.get('cancelled'):
      why = to_text(queue_payload.get('why')) or 'cancelled'
      raise SystemExit(f'Jenkins queue item was cancelled: {why}')

    executable = queue_payload.get('executable') or {}
    build_url = to_text(executable.get('url'))
    if build_url:
      return build_url

    why = to_text(queue_payload.get('why'))
    if why:
      print(f'Waiting Jenkins queue: {why}')
    time.sleep(5)

  raise SystemExit('Timed out waiting for Jenkins queue item to start')


def wait_for_build_result(*, build_url: str, headers: dict[str, str], timeout_seconds: int = 90 * 60) -> str:
  deadline = time.time() + timeout_seconds
  while time.time() < deadline:
    build_payload = request_json(api_url(build_url), headers)
    if build_payload.get('building'):
      print('Jenkins build is still running...')
      time.sleep(10)
      continue

    result = to_text(build_payload.get('result'))
    if result:
      return result
    break

  raise SystemExit('Timed out waiting for Jenkins build result')


def main() -> int:
  base_url = require_env('JENKINS_BASE_URL').rstrip('/')
  username = require_env('JENKINS_USER')
  token = require_env('JENKINS_API_TOKEN')
  repository = require_env('GITHUB_REPOSITORY')
  branch = require_env('GITHUB_REF_NAME')
  commit_sha = require_env('GITHUB_SHA')
  build_version = require_env('BUILD_VERSION')
  image_ref = require_env('IMAGE_REF')
  triggered_by = require_env('TRIGGERED_BY')
  workflow_run_url = require_env('WORKFLOW_RUN_URL')

  deploy_target = resolve_deploy_target(
    branch=branch,
    staging_job=require_env('JENKINS_JOB_STAGING'),
    production_job=require_env('JENKINS_JOB_PRODUCTION'),
  )
  if not deploy_target:
    print(f'Skip Jenkins deployment for unsupported branch: {branch}')
    return 0

  auth_token = base64.b64encode(f'{username}:{token}'.encode('utf-8')).decode('ascii')
  default_headers = {
    'Authorization': f'Basic {auth_token}',
    'Accept': 'application/json',
  }
  crumb_headers = fetch_crumb_headers(base_url, default_headers)

  queue_url = trigger_jenkins_queue(
    base_url=base_url,
    default_headers=default_headers,
    crumb_headers=crumb_headers,
    job_name=deploy_target.job_name,
    repository=repository,
    branch=branch,
    commit_sha=commit_sha,
    build_version=build_version,
    image_ref=image_ref,
    triggered_by=triggered_by,
    workflow_run_url=workflow_run_url,
  )
  print(f'Queued Jenkins build at: {queue_url}')

  build_url = wait_for_build_start(queue_url=queue_url, headers=default_headers)
  print(f'Jenkins build started: {build_url}')

  result = wait_for_build_result(build_url=build_url, headers=default_headers)
  print(f'Jenkins build result: {result}')
  if result != 'SUCCESS':
    raise SystemExit(f'Jenkins deployment failed with result: {result}')
  return 0


if __name__ == '__main__':
  raise SystemExit(main())
