FROM golang:1.14.7-buster

RUN apt-get update -yqq && \
    apt-get install -y --no-install-recommends libsodium-dev libsodium23 && \
    apt-get -y clean && \
    rm -rf /var/lib/apt/lists/*
WORKDIR /app
ADD go.mod go.sum /app/
RUN go mod download
ADD ./cmd /app/cmd
ADD ./internal /app/internal
RUN mkdir -p dist/githubsecretsprovider && go build -a -tags netgo -installsuffix netgo --ldflags '-extldflags "-static"' -o dist/githubsecretsprovider/githubsecretsprovider ./cmd/githubsecretsprovider
