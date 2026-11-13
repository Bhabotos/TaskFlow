# IAM reference policies

Least-privilege policies matching exactly what `.github/workflows/deploy.yml` and `scripts/deploy-ec2.sh` call.
These files are documentation only; nothing in this repo applies them. Create them in the AWS Console (or your IaC).

| File | Attach to | Notes |
| --- | --- | --- |
| `github-oidc-trust-policy.json` | Trust policy of `TaskFlow-GitHubActions-Role` | Only `refs/heads/main` of `Bhabotos/TaskFlow` can assume it. Requires the GitHub OIDC provider in IAM. |
| `github-actions-role-policy.json` | Permissions of `TaskFlow-GitHubActions-Role` | ECR login/push/describe on the `taskflow` repo; `ssm:SendCommand` limited to the one instance and `AWS-RunShellScript`. |
| `ec2-instance-ecr-pull-policy.json` | EC2 instance role | Pull-only from the `taskflow` repo. |

The EC2 instance role also needs the AWS-managed `AmazonSSMManagedInstanceCore` policy so the SSM agent can register and receive commands.

`ssm:DescribeInstanceInformation` and `ssm:GetCommandInvocation` do not support resource-level restrictions, so they use `"Resource": "*"` (read-only).

Because the trust policy is limited to `refs/heads/main`, manually running the workflow from another branch will fail at the AWS credentials step. That is intentional.
