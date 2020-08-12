import { mkdirSync } from "fs";
import { Construct, Duration, RemovalPolicy } from "@aws-cdk/core";
import {
  Function as LambdaFunction,
  IFunction,
  Code,
  Runtime,
  Tracing,
} from "@aws-cdk/aws-lambda";
import { LogGroup, RetentionDays } from "@aws-cdk/aws-logs";
import { lambdaAssetsDir } from "./lambda-assets-dir";
import { GitHubSecret, GitHubSecretOptions } from "./github-secret";

/**
 * Custom Resource provider of {@link GitHubSecret}.
 */
export class GitHubSecretsProvider extends Construct {
  private readonly backendFn: IFunction;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    const handler = "githubsecretsprovider";
    const assetsDir = lambdaAssetsDir(handler);
    mkdirSync(assetsDir, { recursive: true });
    const fn = (this.backendFn = new LambdaFunction(this, "ProviderFunction", {
      handler,
      code: Code.fromAsset(assetsDir),
      runtime: Runtime.GO_1_X,
      timeout: Duration.minutes(5),
      tracing: Tracing.ACTIVE,
    }));

    new LogGroup(fn, "LogGroup", {
      logGroupName: `/aws/lambda/${fn.functionName}`,
      retention: RetentionDays.ONE_YEAR,
      removalPolicy: RemovalPolicy.DESTROY,
    });
  }

  /**
   * Create a {@link GitHubSecret} with the provider's backend function.
   *
   * @param id - construct logical ID
   * @param options - options
   */
  addSecret(id: string, options: GitHubSecretOptions): GitHubSecret {
    return new GitHubSecret(this, id, {
      ...options,
      backendFunction: this.backendFn,
    });
  }
}
