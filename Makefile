.DEFAULT_GOAL := help

include scripts/web/chromium-image.mk

.PHONY: help check unit e2e-electron e2e-web dev-electron dev-web perf-electron

help:
	@echo "make                    Show this help"
	@echo "make setup              Prepare the web-test Docker image (owner only; network required)"
	@echo "make check              Run standard checks, unit coverage, timing guards, and build"
	@echo "make unit               Run unit tests"
	@echo "make e2e-electron        Run Electron end-to-end tests"
	@echo "make e2e-web            Run web end-to-end tests in offline Docker Chromium"
	@echo "make dev-electron       Start Electron development mode"
	@echo "make dev-web            Start the web development server"
	@echo "make perf-electron      Run the full Electron performance suite"

check:
	npm run check

unit:
	npm test

e2e-electron:
	npm run test:e2e

e2e-web:
	npm run test:web:chromium

dev-electron:
	npm run dev

dev-web:
	npm run dev:web

perf-electron:
	npm run test:perf -- --project=electron
