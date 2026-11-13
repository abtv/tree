.DEFAULT_GOAL := help
BUMP ?= patch
RELEASE_BUMP = $(or $(filter-out release,$(MAKECMDGOALS)),$(BUMP))

include scripts/web/chromium-image.mk

.PHONY: help dev dev-web build test-unit test-smoke test-e2e test-memory test-perf test-property test-mutation release

ifneq ($(filter release,$(MAKECMDGOALS)),)
.PHONY: patch minor major
patch minor major:
	@:
endif

help:
	@echo "make                Show available commands"
	@echo "make setup          Prepare the Docker test image (owner only; network required)"
	@echo "make dev            Start Electron in development mode"
	@echo "make dev-web        Start the web development server"
	@echo "make build          Build the application"
	@echo "make test-unit      Run unit and property tests with coverage"
	@echo "make test-smoke     Run all smoke checks on macOS and in Linux Docker"
	@echo "make test-e2e       Run Electron E2E tests locally and web E2E tests in Docker"
	@echo "make test-memory    Run Linux Electron memory tests in Docker"
	@echo "make test-perf      Run domain, Electron, web, and Safari comparison benchmarks"
	@echo "make test-property  Run property tests with increased repetitions"
	@echo "make test-mutation  Check whether tests detect deliberately introduced bugs"
	@echo "make release        Bump patch and commit locally; use make release minor or make release major"

dev:
	npm run dev

dev-web:
	npm run dev:web

build:
	npm run build

test-unit:
	npm run test:coverage

test-smoke:
	npm run build
	npm run test:safari
	npm run test:smoke:electron
	npm run test:smoke:chromium
	npm run test:smoke:safari
	npm run test:smoke:linux

test-e2e:
	npm run test:e2e
	npm run test:web:chromium

test-memory:
	npm run test:e2e:memory

test-perf:
	npm run test:performance
	npm run test:perf
	npm run test:perf:safari

test-property:
	npm run test:property

test-mutation:
	npm run test:mutation

release:
	npm run release -- "$(RELEASE_BUMP)"
