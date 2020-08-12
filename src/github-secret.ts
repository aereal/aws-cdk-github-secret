import { ISecret } from "@aws-cdk/aws-secretsmanager";
import { IFunction } from "@aws-cdk/aws-lambda";
import { CustomResource, Construct } from "@aws-cdk/core";
import { SecretValueRef } from "./secret-value-ref";

const resourceType = "Custom::GitHubSecrets";

/**
 * GitHub repository.
 */
export interface GitHubRepository {
  /**
   * Repositor owner's name
   */
  readonly owner: string;

  /**
   * Repository's name
   */
  readonly name: string;
}

/**
 * The options to build {@link GitHubSecret}.
 */
export interface GitHubSecretOptions {
  /**
   * Repository to store secrets
   */
  readonly repo: GitHubRepository;

  /**
   * Secret name to store
   */
  readonly secretName: string;

  /**
   * Secret value to store
   */
  readonly secretValue: SecretValueRef;

  /**
   * Access token to use GitHub API.
   *
   * It must have `repo` scope.
   *
   * @see https://docs.github.com/en/github/authenticating-to-github/creating-a-personal-access-token
   */
  readonly githubAccessToken: ISecret;
}

/**
 * Complete properties to build {@link GitHubSecret}.
 */
export interface GitHubSecretProps extends GitHubSecretOptions {
  /**
   * The backend function of the custom resource.
   */
  readonly backendFunction: IFunction;
}

/**
 * GitHubSecrets is a custom resource class that stores passed secret values into {@link https://docs.github.com/en/actions/configuring-and-managing-workflows/creating-and-storing-encrypted-secrets | GitHub Actions Secrets}.
 *
 * Usually you should use {@link GitHubSecretsProvider.addSecret}
 */
export class GitHubSecret extends CustomResource {
  constructor(scope: Construct, id: string, props: GitHubSecretProps) {
    const {
      backendFunction,
      repo,
      secretName,
      secretValue,
      githubAccessToken,
    } = props;
    super(scope, id, {
      resourceType,
      pascalCaseProperties: true,
      serviceToken: backendFunction.functionArn,
      properties: {
        repo,
        secretName,
        secretValue: secretValue.value,
        secretResourceType: secretValue.secretType,
        gitHubAuthTokenSecretArn: githubAccessToken.secretArn,
      },
    });
    secretValue.grantRead(backendFunction);
    githubAccessToken.grantRead(backendFunction);
  }
}
