import { IGrantable, Grant } from "@aws-cdk/aws-iam";
import { ISecret } from "@aws-cdk/aws-secretsmanager";
import { IStringParameter } from "@aws-cdk/aws-ssm";

type SecretResourceType =
  | "AWS::SecretsManager::Secret"
  | "AWS::SSM::Parameter"
  | "PlainText";

/**
 * SecretValueRef is an abstract structure that indicates some secret values.
 */
export abstract class SecretValueRef {
  /**
   * Grants reading the secret value to some role.
   *
   * @param grantee - the principal being granted permission
   */
  public abstract grantRead(grantee: IGrantable): Grant;

  constructor(
    public readonly value: string,
    public readonly secretType: SecretResourceType
  ) {}
}

/**
 * SecretmanagerSecretRef is an implementation of SecretValueRef that the underlying is Secrets Manager's secret.
 */
export class SecretsManagerSecretRef extends SecretValueRef {
  private readonly secret: ISecret;

  constructor(secret: ISecret) {
    super(secret.secretArn, "AWS::SecretsManager::Secret");
    this.secret = secret;
  }

  // eslint-disable-next-line jsdoc/require-jsdoc
  grantRead(grantee: IGrantable): Grant {
    return this.secret.grantRead(grantee);
  }
}

/**
 * SSMStringParameterRef is an implementation of SecretValueRef that the underlying is Systems Manager Parameters Store.
 */
export class SSMStringParameterRef extends SecretValueRef {
  private readonly parameter: IStringParameter;

  constructor(parameter: IStringParameter) {
    super(parameter.parameterArn, "AWS::SSM::Parameter");
    this.parameter = parameter;
  }

  // eslint-disable-next-line jsdoc/require-jsdoc
  grantRead(grantee: IGrantable): Grant {
    return this.parameter.grantRead(grantee);
  }
}

/**
 * PlainTextRef is an implementation of SecretValueRef that holds plain value.
 *
 * It is not secure even though routes.
 */
export class PlainTextRef extends SecretValueRef {
  constructor(value: string) {
    super(value, "PlainText");
  }

  // eslint-disable-next-line jsdoc/require-jsdoc
  grantRead(grantee: IGrantable): Grant {
    // noop
    return Grant.drop(grantee, "");
  }
}
