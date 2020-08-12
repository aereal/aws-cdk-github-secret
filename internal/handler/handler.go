package handler

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"

	"github.com/aws/aws-lambda-go/cfn"
	"github.com/aws/aws-sdk-go/aws"
	"github.com/aws/aws-sdk-go/aws/session"
	"github.com/aws/aws-sdk-go/service/secretsmanager"
	"github.com/aws/aws-sdk-go/service/ssm"
	"github.com/aws/aws-xray-sdk-go/xray"
	"github.com/google/go-github/v32/github"
	"github.com/jamesruan/sodium"
	"golang.org/x/oauth2"
	"golang.org/x/sync/errgroup"
)

var (
	errSecretNameIsEmpty               = fmt.Errorf("SecretName is empty")
	errSecretValueIsEmpty              = fmt.Errorf("SecretValue is empty")
	errRepoNameIsEmpty                 = fmt.Errorf("Repo.Name is empty")
	errRepoOwnerIsEmpty                = fmt.Errorf("Repo.Owner is empty")
	errGitHubAuthTokenSecretArnIsEmpty = fmt.Errorf("GitHubAuthTokenSecretArn is empty")
	resourceTypePlainText              = "PlainText"
	resourceTypeSecret                 = "AWS::SecretsManager::Secret"
	resourceTypeParameter              = "AWS::SSM::Parameter"
)

type Handler struct{}

func (h *Handler) Run(ctx context.Context, event cfn.Event) (string, map[string]interface{}, error) {
	physicalID := event.PhysicalResourceID

	props, err := consumeProps(event.ResourceProperties)
	if err != nil {
		return physicalID, nil, err
	}
	// oldProps, err := consumeProps(event.OldResourceProperties)
	// if err != nil {
	// 	return physicalID, nil, err
	// }
	var oldProps *Props = nil

	switch event.RequestType {
	case cfn.RequestCreate, cfn.RequestUpdate:
		data, err := h.createOrUpdateSecret(ctx, event.RequestType, props, oldProps)
		return physicalID, data, err
	case cfn.RequestDelete:
		data, err := h.deleteSecret(ctx, props, oldProps)
		return physicalID, data, err
	default:
		return physicalID, nil, fmt.Errorf("unknown request type: %s", event.RequestType)
	}
}

type preparedValues struct {
	ghClient    *github.Client
	secretValue string
	keyID       string
	pubKey      sodium.BoxPublicKey
}

func (pv *preparedValues) encryptedAndEncodedSecretValue() string {
	boxBytes := sodium.Bytes(pv.secretValue).SealedBox(pv.pubKey)
	return base64.StdEncoding.EncodeToString(boxBytes)
}

func (h *Handler) createOrUpdateSecret(ctx context.Context, reqType cfn.RequestType, props, oldProps *Props) (map[string]interface{}, error) {
	var err error
	ctx, seg := xray.BeginSubsegment(ctx, fmt.Sprintf("createOrUpdateSecret.%s", reqType))
	defer func() {
		if seg != nil {
			seg.Close(err)
		}
	}()

	awsSes := xray.AWSSession(session.Must(session.NewSession()))
	var vals *preparedValues
	vals, err = prepare(ctx, awsSes, props)
	if err != nil {
		return nil, err
	}

	err = putGitHubSecret(ctx, vals.ghClient, props.Repo, vals.keyID, props.SecretName, vals.encryptedAndEncodedSecretValue())
	if err != nil {
		return nil, err
	}

	return nil, nil
}

func (h *Handler) deleteSecret(ctx context.Context, props, oldProps *Props) (map[string]interface{}, error) {
	return nil, nil
}

func prepare(ctx context.Context, awsSes *session.Session, props *Props) (*preparedValues, error) {
	var err error
	ctx, seg := xray.BeginSubsegment(ctx, "prepare")
	defer func() {
		if seg != nil {
			seg.Close(err)
		}
	}()

	ret := &preparedValues{}
	eg, ctx := errgroup.WithContext(ctx)
	eg.Go(func() error {
		var e error
		ret.ghClient, e = buildGitHubClient(ctx, awsSes, props.GitHubAuthTokenSecretArn)
		if e != nil {
			return e
		}
		ret.pubKey, ret.keyID, e = getPublicKey(ctx, ret.ghClient, props.Repo.Owner, props.Repo.Name)
		if e != nil {
			return e
		}
		return nil
	})
	eg.Go(func() error {
		var e error
		ret.secretValue, e = fetchSecretValue(ctx, awsSes, props)
		if e != nil {
			return e
		}
		return nil
	})
	err = eg.Wait()
	if err != nil {
		return nil, err
	}
	return ret, nil
}

func buildGitHubClient(ctx context.Context, awsSes *session.Session, accessTokenArn string) (*github.Client, error) {
	var err error
	ctx, seg := xray.BeginSubsegment(ctx, "buildGitHubClient")
	defer func() {
		if seg != nil {
			seg.Close(err)
		}
	}()

	if awsSes == nil {
		err = fmt.Errorf("awsSes is nil")
		return nil, err
	}

	sm := secretsmanager.New(awsSes)
	resp, err := sm.GetSecretValueWithContext(ctx, &secretsmanager.GetSecretValueInput{
		SecretId: &accessTokenArn,
	})
	if err != nil {
		return nil, err
	}
	if resp.SecretString == nil {
		err = fmt.Errorf("SecretString is nil")
		return nil, err
	}
	accessToken := *resp.SecretString

	tc := oauth2.NewClient(ctx, oauth2.StaticTokenSource(&oauth2.Token{AccessToken: accessToken}))
	return github.NewClient(xray.Client(tc)), nil
}

func getPublicKey(ctx context.Context, client *github.Client, owner, name string) (pubKey sodium.BoxPublicKey, pubKeyID string, err error) {
	ctx, seg := xray.BeginSubsegment(ctx, "getPublicKey")
	defer func() {
		if seg != nil {
			seg.Close(err)
		}
	}()
	if seg != nil {
		seg.AddMetadata("repo.owner", owner)
		seg.AddMetadata("repo.name", name)
	}

	var payload *github.PublicKey
	payload, _, err = client.Actions.GetRepoPublicKey(ctx, owner, name)
	if err != nil {
		return
	}

	raw := make([]byte, 32)
	if _, err = base64.StdEncoding.Decode(raw, []byte(payload.GetKey())); err != nil {
		return
	}

	pubKey = sodium.BoxPublicKey{Bytes: sodium.Bytes(raw)}
	pubKeyID = payload.GetKeyID()
	return
}

func fetchSecretValue(ctx context.Context, awsSes *session.Session, props *Props) (value string, err error) {
	ctx, seg := xray.BeginSubsegment(ctx, "fetchSecretValue")
	defer func() {
		if seg != nil {
			seg.Close(err)
		}
	}()

	switch props.SecretResourceType {
	case resourceTypePlainText:
		value = props.SecretValue
	case resourceTypeParameter:
		ssmClient := ssm.New(awsSes)
		var resp *ssm.GetParameterOutput
		resp, err = ssmClient.GetParameterWithContext(ctx, &ssm.GetParameterInput{WithDecryption: aws.Bool(true), Name: &props.SecretName})
		if err != nil {
			return
		}
		if resp.Parameter != nil && resp.Parameter.Value != nil {
			value = *resp.Parameter.Value
		}
	case resourceTypeSecret:
		smClient := secretsmanager.New(awsSes)
		var resp *secretsmanager.GetSecretValueOutput
		resp, err = smClient.GetSecretValueWithContext(ctx, &secretsmanager.GetSecretValueInput{})
		if err != nil {
			return
		}
		if resp.SecretString != nil {
			value = *resp.SecretString
		}
	}
	return
}

func putGitHubSecret(ctx context.Context, ghClient *github.Client, repo Repo, keyID string, name string, encryptedValue string) error {
	var err error
	ctx, seg := xray.BeginSubsegment(ctx, "putGitHubSecret")
	defer func() {
		if seg != nil {
			seg.Close(err)
		}
	}()

	_, err = ghClient.Actions.CreateOrUpdateRepoSecret(ctx, repo.Owner, repo.Name, &github.EncryptedSecret{
		Name:           name,
		KeyID:          keyID,
		EncryptedValue: encryptedValue,
	})
	if err != nil {
		return err
	}

	return nil
}

type Repo struct {
	Owner string
	Name  string
}

type Props struct {
	Repo                     Repo
	SecretName               string
	SecretValue              string
	SecretResourceType       string
	GitHubAuthTokenSecretArn string
}

func consumeProps(raw map[string]interface{}) (*Props, error) {
	j, err := json.Marshal(raw)
	if err != nil {
		return nil, err
	}
	var p Props
	if err := json.Unmarshal(j, &p); err != nil {
		return nil, err
	}
	if p.Repo.Owner == "" {
		return nil, errRepoOwnerIsEmpty
	}
	if p.Repo.Name == "" {
		return nil, errRepoNameIsEmpty
	}
	if p.SecretName == "" {
		return nil, errSecretNameIsEmpty
	}
	if p.SecretValue == "" {
		return nil, errSecretValueIsEmpty
	}
	if p.GitHubAuthTokenSecretArn == "" {
		return nil, errGitHubAuthTokenSecretArnIsEmpty
	}
	switch p.SecretResourceType {
	case resourceTypeSecret, resourceTypeParameter, resourceTypePlainText:
		// noop
	default:
		return nil, fmt.Errorf("invalid SecretResourceType: %s", p.SecretResourceType)
	}
	return &p, nil
}
