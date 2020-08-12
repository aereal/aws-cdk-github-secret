.PHONY: build
build:
	go build -a -tags netgo -installsuffix netgo --ldflags '-extldflags "-static"' -o dist/githubsecretsprovider/githubsecretsprovider ./cmd/githubsecretsprovider

.PHONY: docker-build
docker-build:
	docker build -t githubsecretsprovider:latest .
	mkdir -p ./dist/githubsecretsprovider
	docker cp "$(shell docker container create githubsecretsprovider:latest)":/app/dist/githubsecretsprovider/githubsecretsprovider ./dist/githubsecretsprovider/githubsecretsprovider
