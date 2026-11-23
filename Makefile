.PHONY: help lint format format-check test test-cov build clean commit typecheck \
	lambda-lint lambda-format-check lambda-test lambda-build porch-test preflight ci \
	review-inventory review-check review-eval-validate

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

typecheck: ## Typecheck app, tests, and lambda
	npm run typecheck
	npm run typecheck --prefix lambda

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

porch-test: ## Porch recorder Python helper unit tests
	npm run porch:test

preflight: ## Root + lambda lint, format-check, typecheck, test, build + porch tests
	npm run lint
	npm run format:check
	npm run typecheck
	npm test
	npm run build
	npm run lambda:lint
	npm run lambda:format:check
	npm run typecheck --prefix lambda
	npm run lambda:test:coverage
	npm run lambda:build
	npm run lambda:package
	npm run porch:test

ci: preflight ## Alias for preflight

review-inventory: ## Build a review inventory (KIND=pr|repo, BASE, LEDGER, WORKTREE=1)
	node scripts/review/inventory.js --kind $(or $(KIND),pr) $(if $(BASE),--base $(BASE),) $(if $(LEDGER),--init $(LEDGER),) $(if $(WORKTREE),--worktree,)

review-check: ## Check a review ledger (LEDGER=path)
	node scripts/review/check-ledger.js $(LEDGER)

review-eval-validate: ## Check seeded review cases still apply
	node scripts/review/eval-case.js validate
