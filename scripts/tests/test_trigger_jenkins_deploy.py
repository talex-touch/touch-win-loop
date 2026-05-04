from __future__ import annotations

import importlib.util
import pathlib
import sys
import unittest
import urllib.error
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

  def test_api_url_appends_default_json_suffix(self) -> None:
    self.assertEqual(
      MODULE.api_url('https://jenkins.example/queue/item/29'),
      'https://jenkins.example/queue/item/29/api/json',
    )
    self.assertEqual(
      MODULE.api_url('https://jenkins.example/job/staging/13/'),
      'https://jenkins.example/job/staging/13/api/json',
    )

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

  def test_fetch_build_console_tail_returns_last_lines(self) -> None:
    with mock.patch.object(MODULE, 'request_text', return_value='one\ntwo\nthree\n'):
      tail = MODULE.fetch_build_console_tail(
        build_url='https://jenkins.example/job/staging/15/',
        headers={'Authorization': 'Basic token'},
        max_lines=2,
      )

    self.assertEqual(tail, 'two\nthree')

  def test_fetch_crumb_headers_tolerates_redirect_when_api_token_exempts_crumb(self) -> None:
    redirect = urllib.error.HTTPError(
      url='https://jenkins.example/crumbIssuer/api/json',
      code=302,
      msg='Found',
      hdrs={'Location': 'http://jenkins.example/crumbIssuer/api/json'},
      fp=None,
    )

    with mock.patch.object(MODULE, 'open_request', side_effect=redirect):
      with mock.patch('builtins.print') as print_mock:
        headers = MODULE.fetch_crumb_headers(
          'https://jenkins.example',
          {'Authorization': 'Basic token'},
        )

    self.assertEqual(headers, {})
    messages = '\n'.join(str(call.args[0]) for call in print_mock.call_args_list)
    self.assertIn('Jenkins crumb request was redirected with HTTP 302 Found', messages)
    self.assertIn('Location: http://jenkins.example/crumbIssuer/api/json.', messages)
    self.assertIn('continue without crumb header', messages)

  def test_required_json_request_reports_redirect_configuration_error(self) -> None:
    redirect = urllib.error.HTTPError(
      url='https://jenkins.example/job/demo/api/json',
      code=302,
      msg='Found',
      hdrs={'Location': 'securityRealm/commenceLogin'},
      fp=None,
    )

    with mock.patch.object(MODULE, 'open_request', side_effect=redirect):
      with self.assertRaises(SystemExit) as context:
        MODULE.request_json(
          'https://jenkins.example/job/demo/api/json',
          {'Authorization': 'Basic token'},
          context='Jenkins build API request',
        )

    message = str(context.exception)
    self.assertIn('Jenkins build API request was redirected with HTTP 302 Found', message)
    self.assertIn('Location: securityRealm/commenceLogin.', message)
    self.assertIn('JENKINS_BASE_URL', message)


if __name__ == '__main__':
  unittest.main()
