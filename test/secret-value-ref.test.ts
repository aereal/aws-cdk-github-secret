import { App, Stack } from "@aws-cdk/core";
import { User } from "@aws-cdk/aws-iam";
import { expect as cdkExpect, haveResource } from "@aws-cdk/assert";
import { StringParameter } from "@aws-cdk/aws-ssm";
import { Secret } from "@aws-cdk/aws-secretsmanager";
import {
  PlainTextRef,
  SSMStringParameterRef,
  SecretsManagerSecretRef,
} from "../src/secret-value-ref";

describe("SecretValueRef", () => {
  describe("PlainTextRef", () => {
    test("value is raw value", () => {
      const ref = new PlainTextRef("poppoe");
      expect(ref.value).toBe("poppoe");
    });

    test("grantRead does nothing", () => {
      const stack = new Stack(new App(), "test-stack");
      const user = new User(stack, "User");
      const ref = new PlainTextRef("poppoe");
      const grant = ref.grantRead(user);
      expect(grant.success).toBe(false);
      expect(grant.principalStatement).toBeUndefined();
      expect(grant.resourceStatement).toBeUndefined();
      cdkExpect(stack).to(haveResource("AWS::IAM::User"));
    });
  });

  describe("SSMStringParameterRef", () => {
    describe("refers directly created parameter", () => {
      test("value is parameterArn", () => {
        const stack = new Stack(new App(), "test-stack");
        const param = new StringParameter(stack, "Parameter", {
          stringValue: "paramValue",
        });
        const ref = new SSMStringParameterRef(param);
        expect(ref.value).toBe(param.parameterArn);
      });

      test("grantRead allows the grantee to read the parameter value", () => {
        const stack = new Stack(new App(), "test-stack");
        const param = new StringParameter(stack, "Parameter", {
          stringValue: "paramValue",
        });
        const user = new User(stack, "User");
        const ref = new SSMStringParameterRef(param);
        const grant = ref.grantRead(user);
        expect(grant.success).toBe(true);
        expect(grant.principalStatement?.toJSON()).toStrictEqual({
          Effect: "Allow",
          Resource: param.parameterArn,
          Action: [
            "ssm:DescribeParameters",
            "ssm:GetParameters",
            "ssm:GetParameter",
            "ssm:GetParameterHistory",
          ],
        });
        expect(grant.resourceStatement).toBeUndefined();
        cdkExpect(stack).to(
          haveResource("AWS::IAM::User")
            .and(haveResource("AWS::SSM::Parameter"))
            .and(haveResource("AWS::IAM::Policy"))
        );
      });
    });

    describe("refers imported parameter", () => {
      test("value is parameterArn", () => {
        const stack = new Stack(new App(), "test-stack");
        const param = StringParameter.fromStringParameterName(
          stack,
          "ImportedParameter",
          "paramName"
        );
        const ref = new SSMStringParameterRef(param);
        expect(ref.value).toBe(param.parameterArn);
      });

      test("grantRead allows the grantee to read the parameter value", () => {
        const stack = new Stack(new App(), "test-stack");
        const param = StringParameter.fromStringParameterName(
          stack,
          "ImportedParameter",
          "paramName"
        );
        const user = new User(stack, "User");
        const ref = new SSMStringParameterRef(param);
        const grant = ref.grantRead(user);
        expect(grant.success).toBe(true);
        expect(grant.principalStatement?.toJSON()).toStrictEqual({
          Effect: "Allow",
          Resource: param.parameterArn,
          Action: [
            "ssm:DescribeParameters",
            "ssm:GetParameters",
            "ssm:GetParameter",
            "ssm:GetParameterHistory",
          ],
        });
        expect(grant.resourceStatement).toBeUndefined();
        cdkExpect(stack).to(
          haveResource("AWS::IAM::User").and(haveResource("AWS::IAM::Policy"))
        );
      });
    });
  });

  describe("SecretsManagerSecretRef", () => {
    describe("refers directly created secret", () => {
      test("value is secretArn", () => {
        const stack = new Stack(new App(), "test-stack");
        const secret = new Secret(stack, "Secret");
        const ref = new SecretsManagerSecretRef(secret);
        expect(ref.value).toBe(secret.secretArn);
      });

      test("grantRead allows the grantee to read the secret value", () => {
        const stack = new Stack(new App(), "test-stack");
        const secret = new Secret(stack, "Secret");
        const ref = new SecretsManagerSecretRef(secret);
        const user = new User(stack, "User");
        const grant = ref.grantRead(user);
        expect(grant.success).toBe(true);
        expect(grant.principalStatement?.toJSON()).toStrictEqual({
          Effect: "Allow",
          Resource: secret.secretArn,
          Action: [
            "secretsmanager:GetSecretValue",
            "secretsmanager:DescribeSecret",
          ],
        });
        expect(grant.resourceStatement).toBeUndefined();
        cdkExpect(stack).to(
          haveResource("AWS::IAM::User")
            .and(haveResource("AWS::SecretsManager::Secret"))
            .and(haveResource("AWS::IAM::Policy"))
        );
      });
    });

    describe("refers imported secret", () => {
      test("value is secretArn", () => {
        const app = new App();
        const otherStack = new Stack(app, "otherStack");
        const originalSecret = new Secret(otherStack, "Secret");
        const stack = new Stack(app, "test-stack");
        const secret = Secret.fromSecretArn(
          stack,
          "ImportedSecret",
          originalSecret.secretArn
        );
        const ref = new SecretsManagerSecretRef(secret);
        expect(ref.value).toBe(secret.secretArn);
      });

      test("grantRead allows the grantee to read the secret value", () => {
        const app = new App();
        const otherStack = new Stack(app, "otherStack");
        const originalSecret = new Secret(otherStack, "Secret");
        const stack = new Stack(app, "test-stack");
        const secret = Secret.fromSecretArn(
          stack,
          "ImportedSecret",
          originalSecret.secretArn
        );

        const ref = new SecretsManagerSecretRef(secret);
        const user = new User(stack, "User");
        const grant = ref.grantRead(user);
        expect(grant.success).toBe(true);
        expect(grant.principalStatement?.toJSON()).toStrictEqual({
          Effect: "Allow",
          Resource: secret.secretArn,
          Action: [
            "secretsmanager:GetSecretValue",
            "secretsmanager:DescribeSecret",
          ],
        });
        expect(grant.resourceStatement).toBeUndefined();
        cdkExpect(stack).to(
          haveResource("AWS::IAM::User").and(haveResource("AWS::IAM::Policy"))
        );
      });
    });
  });
});
