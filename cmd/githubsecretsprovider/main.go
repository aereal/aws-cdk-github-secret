package main

import (
	"context"

	"github.com/aereal/aws-cdk-github-secret/internal/handler"
	"github.com/aws/aws-lambda-go/cfn"
	"github.com/aws/aws-lambda-go/lambda"
)

func main() {
	lambda.Start(cfn.LambdaWrap(githubsecretsprovider))
}

func githubsecretsprovider(ctx context.Context, event cfn.Event) (string, map[string]interface{}, error) {
	h := &handler.Handler{}
	return h.Run(ctx, event)
}
