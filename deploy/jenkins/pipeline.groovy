String requiredValue(script, String name) {
  String value = String.valueOf(script.params[name] ?: '').trim()
  if (!value) {
    script.error("Missing required parameter: ${name}")
  }
  return value
}

String shellQuote(String raw) {
  return "'${String.valueOf(raw).replace("'", "'\"'\"'")}'"
}

String sanitizePathComponent(String raw) {
  return String.valueOf(raw).replaceAll(/[^A-Za-z0-9_.-]+/, '-')
}

String truncateText(String raw, int maxLength = 160) {
  String value = String.valueOf(raw ?: '').trim()
  if (!value) {
    return ''
  }
  if (value.length() <= maxLength) {
    return value
  }
  return "${value.substring(0, Math.max(0, maxLength - 3))}..."
}

String shortenSha(String raw) {
  String value = String.valueOf(raw ?: '').trim()
  if (!value) {
    return '-'
  }
  return value.length() <= 7 ? value : value.take(7)
}

String normalizeCredentialsId(String raw, Map aliases = [:]) {
  String value = String.valueOf(raw).trim()
  return String.valueOf(aliases.getOrDefault(value, value)).trim()
}

Map readDeploymentReport(script) {
  if (!script.fileExists('deployment.json')) {
    return [:]
  }

  try {
    def parsed = new groovy.json.JsonSlurperClassic().parseText(script.readFile(file: 'deployment.json'))
    return parsed instanceof Map ? (Map)parsed : [:]
  }
  catch (Throwable error) {
    script.echo("Failed to parse deployment.json: ${error.message}")
    return [:]
  }
}

String buildFeishuDeployNotifyText(Map input = [:]) {
  List<String> lines = [
    'WinLoop Jenkins 部署通知',
    "结果：${input.resultLabel ?: '-'}",
    "环境：${input.deployEnvironment ?: '-'}",
    "分支：${input.branch ?: '-'}",
    "版本：${input.buildVersion ?: '-'}",
    "Commit：${input.buildCommitSha ?: '-'}",
    "镜像：${input.imageRef ?: '-'}",
  ]

  String reportStatus = String.valueOf(input.reportStatus ?: '').trim()
  String reportStage = String.valueOf(input.reportStage ?: '').trim()
  String reportMessage = String.valueOf(input.reportMessage ?: '').trim()
  String triggeredBy = String.valueOf(input.triggeredBy ?: '').trim()
  String workflowRunUrl = String.valueOf(input.workflowRunUrl ?: '').trim()
  String buildUrl = String.valueOf(input.buildUrl ?: '').trim()
  String rollbackLabel = String.valueOf(input.rollbackLabel ?: '').trim()

  if (reportStatus) {
    lines << "部署状态：${reportStatus}"
  }
  if (reportStage) {
    lines << "失败阶段：${reportStage}"
  }
  if (reportMessage) {
    lines << "详情：${truncateText(reportMessage, 300)}"
  }
  if (rollbackLabel) {
    lines << "回滚：${rollbackLabel}"
  }
  if (triggeredBy) {
    lines << "触发来源：${triggeredBy}"
  }
  if (workflowRunUrl) {
    lines << "GitHub：${workflowRunUrl}"
  }
  if (buildUrl) {
    lines << "Jenkins：${buildUrl}"
  }

  return lines.findAll { String.valueOf(it).trim() }.join('\n')
}

void sendFeishuDeployNotification(script, Map config = [:], Map input = [:]) {
  String webhookCredentialsId = String.valueOf(
    config.feishuWebhookCredentialsId ?: script.env.WINLOOP_FEISHU_WEBHOOK_CREDENTIALS_ID ?: '',
  ).trim()
  if (!webhookCredentialsId) {
    script.echo('Skip Feishu notification: webhook credentials are not configured.')
    return
  }

  String secretCredentialsId = String.valueOf(
    config.feishuWebhookSecretCredentialsId ?: script.env.WINLOOP_FEISHU_WEBHOOK_SECRET_CREDENTIALS_ID ?: '',
  ).trim()
  String sshCredentialsId = String.valueOf(config.sshCredentialsId ?: '').trim()
  String sshTarget = String.valueOf(config.sshTarget ?: '').trim()
  String sshOptions = String.valueOf(config.sshOptions ?: '-o BatchMode=yes -o StrictHostKeyChecking=accept-new').trim()

  if (!sshCredentialsId || !sshTarget) {
    script.echo('Skip Feishu notification: ssh credentials or target is missing.')
    return
  }

  List<Map> bindings = [[
    $class: 'StringBinding',
    credentialsId: webhookCredentialsId,
    variable: 'FEISHU_WEBHOOK_URL',
  ]]
  if (secretCredentialsId) {
    bindings << [
      $class: 'StringBinding',
      credentialsId: secretCredentialsId,
      variable: 'FEISHU_WEBHOOK_SECRET',
    ]
  }

  String notifyText = buildFeishuDeployNotifyText(input)
  script.withCredentials(bindings) {
    script.sshagent(credentials: [sshCredentialsId]) {
      script.sh(
        label: 'send feishu deployment notification',
        script: """#!/usr/bin/env bash
set -euo pipefail
ssh_target=${shellQuote(sshTarget)}
notify_text=${shellQuote(notifyText)}
notify_text_b64="\$(printf '%s' "\${notify_text}" | base64 | tr -d '\\n')"
webhook_url_b64="\$(printf '%s' "\${FEISHU_WEBHOOK_URL}" | base64 | tr -d '\\n')"
webhook_secret_b64="\$(printf '%s' "\${FEISHU_WEBHOOK_SECRET:-}" | base64 | tr -d '\\n')"
cat <<'PY' | ssh ${sshOptions} "\${ssh_target}" "FEISHU_NOTIFY_TEXT_B64='\${notify_text_b64}' FEISHU_WEBHOOK_URL_B64='\${webhook_url_b64}' FEISHU_WEBHOOK_SECRET_B64='\${webhook_secret_b64}' python3 -"
import base64
import hashlib
import hmac
import json
import os
import time
import urllib.request


def decode_env(name: str) -> str:
    raw = str(os.environ.get(name, '')).strip()
    if not raw:
        return ''
    return base64.b64decode(raw.encode('utf-8')).decode('utf-8')


webhook_url = decode_env('FEISHU_WEBHOOK_URL_B64').strip()
webhook_secret = decode_env('FEISHU_WEBHOOK_SECRET_B64').strip()
notify_text = decode_env('FEISHU_NOTIFY_TEXT_B64')

if not webhook_url:
    raise SystemExit('Missing Feishu webhook URL')

payload = {
    'msg_type': 'text',
    'content': {
        'text': notify_text,
    },
}

if webhook_secret:
    timestamp = str(int(time.time()))
    string_to_sign = f'{timestamp}\\n{webhook_secret}'
    sign = base64.b64encode(
        hmac.new(string_to_sign.encode('utf-8'), digestmod=hashlib.sha256).digest(),
    ).decode('utf-8')
    payload['timestamp'] = timestamp
    payload['sign'] = sign

request = urllib.request.Request(
    webhook_url,
    data=json.dumps(payload, ensure_ascii=False).encode('utf-8'),
    headers={'Content-Type': 'application/json; charset=utf-8'},
    method='POST',
)
with urllib.request.urlopen(request, timeout=15) as response:
    body = response.read().decode('utf-8', errors='replace')

result = json.loads(body) if body else {}
code = result.get('code', 0)
if code not in (0, '0', None):
    raise SystemExit(f"Feishu webhook returned code={code}, msg={result.get('msg', '')}")
PY
""",
      )
    }
  }
}

void runPipeline(script, Map config = [:]) {
  String deployEnvironment = String.valueOf(config.deployEnvironment ?: '').trim()
  String expectedBranch = String.valueOf(config.expectedBranch ?: '').trim()
  String expectedRepository = String.valueOf(config.expectedRepository ?: 'talex-touch/touch-win-loop').trim()
  String ghcrCredentialsId = normalizeCredentialsId(
    config.ghcrCredentialsId ?: '40a0292f-ea02-4882-8d0e-659efe25861b',
    [
      'ghcr-readonly': '40a0292f-ea02-4882-8d0e-659efe25861b',
    ],
  )
  String sshCredentialsId = String.valueOf(config.sshCredentialsId ?: '').trim()
  String sshTarget = String.valueOf(config.sshTarget ?: '').trim()
  String remoteWorkspaceRoot = String.valueOf(config.remoteWorkspaceRoot ?: '/tmp/touch-win-loop-jenkins').trim()
  String remoteDeployBaseDir = String.valueOf(config.remoteDeployBaseDir ?: '').trim()

  if (!deployEnvironment) {
    script.error('Missing deployEnvironment in pipeline config')
  }
  if (!expectedBranch) {
    script.error('Missing expectedBranch in pipeline config')
  }
  if (!ghcrCredentialsId) {
    script.error('Missing ghcrCredentialsId in pipeline config')
  }
  if (!sshCredentialsId) {
    script.error('Missing sshCredentialsId in pipeline config')
  }
  if (!sshTarget) {
    script.error('Missing sshTarget in pipeline config')
  }

  String repository = requiredValue(script, 'GITHUB_REPOSITORY')
  String branch = requiredValue(script, 'GITHUB_BRANCH')
  String buildCommitSha = requiredValue(script, 'BUILD_COMMIT_SHA')
  String buildVersion = requiredValue(script, 'BUILD_VERSION')
  String imageRef = requiredValue(script, 'IMAGE_REF')
  String triggeredBy = String.valueOf(script.params.TRIGGERED_BY ?: '').trim()
  String workflowRunUrl = String.valueOf(script.params.WORKFLOW_RUN_URL ?: '').trim()
  String remoteWorkspace = "${remoteWorkspaceRoot}/${sanitizePathComponent(script.env.JOB_NAME ?: 'job')}/${sanitizePathComponent(script.env.BUILD_NUMBER ?: '0')}-${deployEnvironment}"
  String sshOptions = '-o BatchMode=yes -o StrictHostKeyChecking=accept-new'
  Throwable pipelineError = null

  script.currentBuild.displayName = "#${script.env.BUILD_NUMBER} ${deployEnvironment} ${buildVersion}"
  script.currentBuild.description = "${branch} ${buildCommitSha.take(7)} ${imageRef}"

  try {
    script.stage('Validate parameters') {
      if (repository != expectedRepository) {
        script.error("Unexpected repository: ${repository}")
      }
      if (branch != expectedBranch) {
        script.error("Unexpected branch for ${deployEnvironment}: ${branch}")
      }
      if (!(imageRef ==~ /^ghcr\.io\/.+@sha256:[0-9a-f]{64}$/)) {
        script.error("IMAGE_REF must be an immutable GHCR digest: ${imageRef}")
      }

      String checkedOutSha = script.sh(
        script: 'git rev-parse HEAD',
        returnStdout: true,
      ).trim()
      if (!checkedOutSha.equalsIgnoreCase(buildCommitSha)) {
        script.error("Checked-out commit ${checkedOutSha} does not match BUILD_COMMIT_SHA ${buildCommitSha}")
      }

      script.echo("triggered_by=${triggeredBy ?: 'unknown'}")
      if (workflowRunUrl) {
        script.echo("workflow_run_url=${workflowRunUrl}")
      }
    }

    script.stage('Notify Feishu Start') {
      try {
        sendFeishuDeployNotification(script, [
          feishuWebhookCredentialsId: config.feishuWebhookCredentialsId,
          feishuWebhookSecretCredentialsId: config.feishuWebhookSecretCredentialsId,
          sshCredentialsId: sshCredentialsId,
          sshTarget: sshTarget,
          sshOptions: sshOptions,
        ], [
          resultLabel: '开始',
          deployEnvironment: deployEnvironment,
          branch: branch,
          buildVersion: buildVersion,
          buildCommitSha: shortenSha(buildCommitSha),
          imageRef: truncateText(imageRef, 120),
          triggeredBy: triggeredBy,
          workflowRunUrl: workflowRunUrl,
          buildUrl: String.valueOf(script.env.BUILD_URL ?: '').trim(),
        ])
      }
      catch (Throwable notifyError) {
        script.echo("Feishu start notification failed: ${notifyError.message}")
      }
    }

    script.stage('Deploy over SSH') {
      script.withCredentials([
        [
          $class: 'UsernamePasswordMultiBinding',
          credentialsId: ghcrCredentialsId,
          usernameVariable: 'GHCR_USERNAME',
          passwordVariable: 'GHCR_TOKEN',
        ],
      ]) {
        script.sshagent(credentials: [sshCredentialsId]) {
          script.sh(
            label: "deploy ${deployEnvironment} over ssh",
            script: """#!/usr/bin/env bash
set -euo pipefail
remote_workspace=${shellQuote(remoteWorkspace)}
ssh_target=${shellQuote(sshTarget)}
mkdir -p .jenkins-dist
cp "deploy/jenkins/deploy-winloop.sh" ".jenkins-dist/deploy-winloop.sh"
cp "deploy/jenkins/compose.yaml" ".jenkins-dist/compose.yaml"
mkdir -p ".jenkins-dist/scripts"
rm -rf ".jenkins-dist/scripts/migrations"
cp -R "scripts/migrations" ".jenkins-dist/scripts/migrations"
chmod +x ".jenkins-dist/deploy-winloop.sh"
ssh ${sshOptions} "\${ssh_target}" "rm -rf \\"\${remote_workspace}\\" && mkdir -p \\"\${remote_workspace}\\""
scp ${sshOptions} ".jenkins-dist/deploy-winloop.sh" ".jenkins-dist/compose.yaml" "\${ssh_target}:\${remote_workspace}/"
scp -r ${sshOptions} ".jenkins-dist/scripts" "\${ssh_target}:\${remote_workspace}/"
printf '%s' "\${GHCR_TOKEN}" | ssh ${sshOptions} "\${ssh_target}" "set -euo pipefail
chmod +x \\"\${remote_workspace}/deploy-winloop.sh\\"
cd \\"\${remote_workspace}\\"
docker login ghcr.io -u \\"\${GHCR_USERNAME}\\" --password-stdin >/dev/null
${remoteDeployBaseDir ? "export WINLOOP_DEPLOY_BASE_DIR=${shellQuote(remoteDeployBaseDir)}" : ":"}
export WINLOOP_DEPLOY_TEMPLATE_FILE=\\"\${remote_workspace}/compose.yaml\\"
export WINLOOP_DEPLOY_REPORT_FILE=\\"\${remote_workspace}/deployment.json\\"
\\"\${remote_workspace}/deploy-winloop.sh\\" --env ${shellQuote(deployEnvironment)} --image-ref ${shellQuote(imageRef)} --build-version ${shellQuote(buildVersion)} --build-commit-sha ${shellQuote(buildCommitSha)} 2>&1 | tee \\"\${remote_workspace}/deployment.log\\"
docker logout ghcr.io >/dev/null 2>&1 || true
" | tee deployment.log
""",
          )
        }
      }
    }
  }
  catch (Throwable error) {
    pipelineError = error
    throw error
  }
  finally {
    script.stage('Fetch remote artifacts') {
      script.sshagent(credentials: [sshCredentialsId]) {
        script.sh(
          label: 'fetch remote deployment artifacts',
          script: """#!/usr/bin/env bash
set -euo pipefail
remote_workspace=${shellQuote(remoteWorkspace)}
ssh_target=${shellQuote(sshTarget)}
scp ${sshOptions} "\${ssh_target}:\${remote_workspace}/deployment.json" "deployment.json" 2>/dev/null || true
scp ${sshOptions} "\${ssh_target}:\${remote_workspace}/deployment.log" "deployment.remote.log" 2>/dev/null || true
ssh ${sshOptions} "\${ssh_target}" "rm -rf \\"\${remote_workspace}\\"" 2>/dev/null || true
""",
        )
      }
    }
    script.stage('Archive artifacts') {
      script.archiveArtifacts(
        artifacts: 'deployment.json,deployment.log,deployment.remote.log',
        allowEmptyArchive: true,
        onlyIfSuccessful: false,
      )
    }
    script.stage('Notify Feishu') {
      Map deploymentReport = readDeploymentReport(script)
      String reportStatus = String.valueOf(deploymentReport.status ?: '').trim()
      String reportStage = String.valueOf(deploymentReport.stage ?: '').trim()
      String reportMessage = String.valueOf(
        deploymentReport.message ?: (pipelineError != null ? pipelineError.message : ''),
      ).trim()
      String rollbackLabel = Boolean.valueOf(String.valueOf(deploymentReport.rolledBack ?: false))
        ? '已执行'
        : '未执行'
      String resultLabel = pipelineError == null ? '成功' : '失败'

      try {
        sendFeishuDeployNotification(script, [
          feishuWebhookCredentialsId: config.feishuWebhookCredentialsId,
          feishuWebhookSecretCredentialsId: config.feishuWebhookSecretCredentialsId,
          sshCredentialsId: sshCredentialsId,
          sshTarget: sshTarget,
          sshOptions: sshOptions,
        ], [
          resultLabel: resultLabel,
          deployEnvironment: deployEnvironment,
          branch: branch,
          buildVersion: buildVersion,
          buildCommitSha: shortenSha(buildCommitSha),
          imageRef: truncateText(imageRef, 120),
          reportStatus: reportStatus,
          reportStage: reportStage,
          reportMessage: reportMessage,
          rollbackLabel: pipelineError == null && !reportStatus ? '' : rollbackLabel,
          triggeredBy: triggeredBy,
          workflowRunUrl: workflowRunUrl,
          buildUrl: String.valueOf(script.env.BUILD_URL ?: '').trim(),
        ])
      }
      catch (Throwable notifyError) {
        script.echo("Feishu notification failed: ${notifyError.message}")
      }
    }
  }
}

return this
