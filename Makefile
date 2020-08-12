.PHONY: build
build:
	docker build -t githubsecretsprovider:latest .
	mkdir -p ./dist/githubsecretsprovider
	docker cp "$(shell docker container create githubsecretsprovider:latest)":/app/dist/githubsecretsprovider/githubsecretsprovider ./dist/githubsecretsprovider/githubsecretsprovider
