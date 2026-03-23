# Contributing to Ship

Thank you for your interest in contributing to Ship! This document provides guidelines and instructions for contributing.

## Code of Conduct

We expect all contributors to be respectful and professional in their interactions. By participating in this project, you agree to maintain a welcoming and inclusive environment.

## How to Contribute

### Mainline Delivery Rule

Finished work must not stay only on a branch, in a worktree, or in a single coding session.

The required finish line for accepted or deployed work is:

1. Commit the changes
2. Move the committed changes onto local `main` if they were developed elsewhere
3. Push the result to `origin/main`
4. If production should reflect the work, redeploy production from that exact `main` commit

Pull requests are optional. They can still be used for review, but they are not required to keep GitHub `main` and production in sync.

### Reporting Issues

If you find a bug or have a feature request:

1. Check existing issues to avoid duplicates
2. Create a new issue with a clear title and description
3. Include steps to reproduce bugs
4. Add relevant labels if available

### Submitting Changes

1. Create a branch if it helps you work safely
2. Make your changes
3. Write or update tests as needed
4. Ensure all relevant tests pass
5. Commit your changes with clear commit messages
6. Move the final committed work onto local `main`
7. Push `main` to `origin/main`
8. If production should reflect the change, redeploy from that same `main` commit

### Pull Requests

- PRs are optional for review and discussion
- If you use a PR, keep it focused on a single feature or fix
- Make sure the final delivered code still lands on `origin/main`
- Do not treat a change as done while it exists only on a branch or only in production

## Development Setup

```bash
# Install dependencies
pnpm install

# Start development servers
pnpm dev

# Run tests
pnpm test

# Type check
pnpm type-check
```

## Questions?

If you have questions, feel free to open an issue for discussion.

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
