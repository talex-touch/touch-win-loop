properties([
  disableConcurrentBuilds(),
  buildDiscarder(logRotator(numToKeepStr: '30')),
  parameters([
    string(name: 'GITHUB_REPOSITORY', defaultValue: 'talex-touch/touch-win-loop', trim: true),
    string(name: 'GITHUB_BRANCH', defaultValue: 'dev', trim: true),
    string(name: 'BUILD_COMMIT_SHA', defaultValue: '', trim: true),
    string(name: 'BUILD_VERSION', defaultValue: '', trim: true),
    string(name: 'IMAGE_REF', defaultValue: '', trim: true),
    string(name: 'TRIGGERED_BY', defaultValue: 'manual', trim: true),
    string(name: 'WORKFLOW_RUN_URL', defaultValue: '', trim: true),
  ]),
])

node('built-in') {
  deleteDir()

  checkout([
    $class: 'GitSCM',
    branches: [[name: "*/${params.GITHUB_BRANCH}"]],
    userRemoteConfigs: [[
      url: 'https://github.com/talex-touch/touch-win-loop.git',
      credentialsId: 'github-readonly',
    ]],
  ])

  sh """#!/usr/bin/env bash
set -euo pipefail
git checkout --detach '${params.BUILD_COMMIT_SHA}'
"""

  def pipelineScript = load 'deploy/jenkins/pipeline.groovy'
  pipelineScript.runPipeline(this, [
    deployEnvironment: 'staging',
    expectedBranch: 'dev',
    expectedRepository: 'talex-touch/touch-win-loop',
    ghcrCredentialsId: '40a0292f-ea02-4882-8d0e-659efe25861b',
    sshCredentialsId: 'touch-center-ssh',
    sshTarget: 'root@center.tagzxia.com',
    remoteWorkspaceRoot: '/tmp/touch-win-loop-jenkins',
    remoteDeployBaseDir: '/opt/deploy/touch-win-loop',
  ])
}
