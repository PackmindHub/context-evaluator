# Project Context

This is a test project for the Agents.md evaluator.

## Project Overview

A backend service for processing user data with REST API endpoints.

## Technology Stack

- Node.js v18
- Express.js for API
- PostgreSQL for database
- Jest for testing

## Project Structure

```
src/
  api/        - REST API endpoints
  services/   - Business logic layer
  models/     - Database models
  utils/      - Shared utilities
```

## Key Concepts

### User Model

The User model represents authenticated users in the system. It includes fields for email, password hash, and profile data.

### Authentication Flow

Users authenticate via JWT tokens. The login endpoint validates credentials and returns a token that must be included in subsequent requests.

## Development Guidelines

### Code Style

- Use TypeScript strict mode
- Follow ESLint configuration
- Write unit tests for all services
- Use async/await for asynchronous operations

### API Conventions

All API endpoints follow REST principles:
- GET for retrieval
- POST for creation
- PUT for updates
- DELETE for removal

Response format is always JSON with consistent error structure.

## Common Tasks

### Running Tests

```bash
npm test
```

### Starting Development Server

```bash
npm run dev
```

### Database Migrations

```bash
npm run migrate
```
