# Overview

This spec is a conservative support-layer change for Nexus.

It deliberately keeps the existing harness model intact:

- structured verification remains the source of truth for completion claims
- prompts become clearer about fresh evidence
- task switching becomes more explicit about state and handoff
- the retry wrapper remains optional

The implementation should stay dependency-free and should avoid widening the scope into a full orchestration rewrite.
