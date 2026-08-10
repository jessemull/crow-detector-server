.PHONY: help lint format format-check test test-cov build clean commit \
	lambda-lint lambda-format-check lambda-test lambda-build preflight ci

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

lint: ## Run root ESLint
	npm run lint

format: ## Format with Prettier
	npm run format

format-check: ## Check Prettier formatting
	npm run format:check

test: ## Run root Jest tests
	npm test

test-cov: ## Run root Jest with coverage
	npm run test:cov

build: ## Nest production build
	npm run build

clean: ## Remove dist/
	rm -rf dist

commit: ## Interactive Commitizen commit
	npm run commit

lambda-lint: ## Lambda ESLint
	npm run lambda:lint

lambda-format-check: ## Lambda Prettier check
	npm run lambda:format:check

lambda-test: ## Lambda Jest with coverage
	npm run lambda:test:coverage

lambda-build: ## Lambda webpack build + zip
	npm run lambda:build
	npm run lambda:package

preflight: ## Root + lambda lint, format-check, test, build
	npm run lint
	npm run format:check
	npm test
	npm run build
	npm run lambda:lint
	npm run lambda:format:check
	npm run lambda:test:coverage
	npm run lambda:build
	npm run lambda:package

ci: preflight ## Alias for preflight
