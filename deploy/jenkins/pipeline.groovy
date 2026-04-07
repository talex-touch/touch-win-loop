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

void runPipeline(script, Map config = [:]) {
  String deployEnvironment = String.valueOf(config.deployEnvironment ?: '').trim()
  String expectedBranch = String.valueOf(config.expectedBranch ?: '').trim()
  String expectedRepository = String.valueOf(config.expectedRepository ?: 'talex-touch/touch-win-loop').trim()
  String ghcrCredentialsId = String.valueOf(config.ghcrCredentialsId ?: '40a0292f-ea02-4882-8d0e-659efe25861b').trim()
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
chmod +x ".jenkins-dist/deploy-winloop.sh"
ssh ${sshOptions} "\${ssh_target}" "rm -rf \\"\${remote_workspace}\\" && mkdir -p \\"\${remote_workspace}\\""
scp ${sshOptions} ".jenkins-dist/deploy-winloop.sh" ".jenkins-dist/compose.yaml" "\${ssh_target}:\${remote_workspace}/"
printf '%s' "\${GHCR_TOKEN}" | ssh ${sshOptions} "\${ssh_target}" "set -euo pipefail
chmod +x \\"\${remote_workspace}/deploy-winloop.sh\\"
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
  }
}

return this
