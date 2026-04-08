from __future__ import annotations

import importlib.util
import pathlib
import sys
import unittest
from unittest import mock


ROOT = pathlib.Path(__file__).resolve().parents[1]
MODULE_PATH = ROOT / 'ci' / 'trigger_jenkins_deploy.py'
SPEC = importlib.util.spec_from_file_location('trigger_jenkins_deploy', MODULE_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)


class TriggerJenkinsDeployTests(unittest.TestCase):
  def test_resolve_deploy_target(self) -> None:
    staging = MODULE.resolve_deploy_target('dev', 'folder/staging', 'folder/prod')
    production = MODULE.resolve_deploy_target('main', 'folder/staging', 'folder/prod')
    unsupported = MODULE.resolve_deploy_target('feature/demo', 'folder/staging', 'folder/prod')

    self.assertIsNotNone(staging)
    self.assertEqual(staging.environment, 'staging')
    self.assertEqual(staging.job_name, 'folder/staging')

    self.assertIsNotNone(production)
    self.assertEqual(production.environment, 'prod')
    self.assertEqual(production.job_name, 'folder/prod')

    self.assertIsNone(unsupported)

  def test_job_path_supports_nested_jobs(self) -> None:
    self.assertEqual(MODULE.job_path('folder/staging'), '/job/folder/job/staging')
    self.assertEqual(MODULE.job_path('/root/prod/'), '/job/root/job/prod')

  def test_build_deploy_started_message_contains_required_fields(self) -> None:
    message = MODULE.build_deploy_started_message(
      environment='staging',
      repository='talex-touch/touch-win-loop',
      branch='dev',
      commit_sha='abc1234',
      build_version='dev-99-abc1234',
      image_ref='ghcr.io/talex-touch/touch-win-loop@sha256:deadbeef',
      workflow_run_url='https://github.com/example/actions/runs/1',
      jenkins_build_url='https://jenkins.example/job/staging/15/',
      actor='TalexDreamSoul',
      triggered_by='github-actions',
    )

    self.assertIn('WinLoop 部署开始', message)
    self.assertIn('环境：staging', message)
    self.assertIn('仓库：talex-touch/touch-win-loop', message)
    self.assertIn('分支：dev', message)
    self.assertIn('Commit：abc1234', message)
    self.assertIn('构建版本：dev-99-abc1234', message)
    self.assertIn('镜像：ghcr.io/talex-touch/touch-win-loop@sha256:deadbeef', message)
    self.assertIn('触发人：TalexDreamSoul', message)
    self.assertIn('触发来源：github-actions', message)
    self.assertIn('GitHub Actions：https://github.com/example/actions/runs/1', message)
    self.assertIn('Jenkins：https://jenkins.example/job/staging/15/', message)

  def test_wait_for_build_start_returns_build_url_when_queue_enters_execution(self) -> None:
    with mock.patch.object(MODULE, 'request_json', side_effect=[
      {
        'why': 'Waiting for next available executor',
      },
      {
        'executable': {
          'url': 'https://jenkins.example/job/staging/15/',
        },
      },
    ]):
      with mock.patch.object(MODULE.time, 'sleep', return_value=None):
        build_url = MODULE.wait_for_build_start(
          queue_url='https://jenkins.example/queue/item/99/',
          headers={'Authorization': 'Basic token'},
          timeout_seconds=5,
        )

    self.assertEqual(build_url, 'https://jenkins.example/job/staging/15/')

  def test_wait_for_build_result_returns_success_after_running(self) -> None:
    with mock.patch.object(MODULE, 'request_json', side_effect=[
      {
        'building': True,
      },
      {
        'building': False,
        'result': 'SUCCESS',
      },
    ]):
      with mock.patch.object(MODULE.time, 'sleep', return_value=None):
        result = MODULE.wait_for_build_result(
          build_url='https://jenkins.example/job/staging/15/',
          headers={'Authorization': 'Basic token'},
          timeout_seconds=5,
        )

    self.assertEqual(result, 'SUCCESS')


if __name__ == '__main__':
  unittest.main()
