---
name: code-reviewer
description: Reviews code for potential bugs, security issues, performance bottlenecks, and style guide compliance.
---

# Code Reviewer Skill

This skill guides the agent on how to perform thorough, constructive, and highly valuable code reviews.

## Review Guidelines

When reviewing code, always evaluate the following aspects:

1. **Correctness & Logic:**
   - Are there edge cases that aren't handled (e.g., null pointers, empty arrays, division by zero)?
   - Is the logic robust and easy to follow?

2. **Security:**
   - Are there any input validation issues, SQL injection risks, or cross-site scripting (XSS) vulnerabilities?
   - Is sensitive data handled securely?

3. **Performance:**
   - Are there redundant computations, memory leaks, or inefficient database queries?
   - Is execution complexity (time/space complexity) optimal?

4. **Readability & Maintainability:**
   - Are variables and functions named clearly and descriptively?
   - Is the code self-documenting, or are comments used effectively where complexity warrants them?
   - Does it adhere to standard styling conventions?

## How to Present Feedback

* **Be Constructive:** Explain *why* something is an issue and suggest *how* to improve it.
* **Provide Code Snippets:** Where applicable, offer concrete refactoring examples.
* **Prioritize issues:** Distinguish between critical bugs, performance issues, and minor style suggestions.
