# Session Context

## User Prompts

### Prompt 1

Implement the following plan:

# Plan: Add macOS Code Signing & Notarization to Release Workflow

## Context

Currently, the release workflow (`.github/workflows/ci.yml`) builds all 4 platform binaries on `ubuntu-latest` via Bun's cross-compilation and publishes them unsigned to GitHub Releases. macOS users get Gatekeeper warnings when running unsigned binaries. We need to add Apple code signing and notarization for the two macOS binaries (darwin-arm64, darwin-x64).

## Approach

Restructure the...

### Prompt 2

so test the taf release/0.4.1, but update package.json and changelog.md before

