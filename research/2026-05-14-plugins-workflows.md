# Workflows Plugin

## Context

Generic workflow engine for orchestrating multi-step user stories mixing agent calls, UI elements, and user interactions. Steps are plugins. Definitions and executions are separate DB entities. Built on the existing durable jobs system (`ctx.step` + `ctx.waitFor` + `SuspendSignal`).

## Plugin Structure

```
plugins/apps/plugins/workflows/                 # Umbrella (empty namespace)
  plugins/
    shell/                  # App shell
    engine/                 # Core backend
    homepage/               # Root pane: catalog + launcher
    definition-detail/      # Single definition view
    definition-editor/      # Create/edit definitions
    execution/              # User-facing single execution
    monitoring/             # Debug view of single execution
    steps/                  # Umbrella for step types
      plugins/
        prompt-form/        # UI form step
        agent/              # Agent conversation step
        branch/             # Conditional routing step
```

## Plugin Descriptions

### shell
App shell: registers `Apps.App` at `/workflows`, defines `WorkflowsApp.Sidebar` and `WorkflowsApp.Toolbar` slots, renders the layout. First plugin — everything else contributes into it.

### engine
Core backend infrastructure. Owns the 4 DB tables (workflow_definitions, workflow_definition_steps, workflow_executions, workflow_execution_steps), the `defineStepExecutor` registry, the `workflows.run` durable job, trigger events (`userInputSubmitted`, `stepCompleted`), HTTP API for CRUD on definitions and executions, live-state resources, and the `Workflows.StepType` web slot. The engine does NOT wrap executor calls in `ctx.step()` — it manages state via its own execution_steps table; only executors use `ctx.step`/`ctx.waitFor` internally.

### homepage
Root pane at `/workflows`. Lists available workflow definitions as cards. Shows recent/active executions across all definitions. "New workflow" action to create a definition. "Start" action on each definition card to launch a new execution.

### definition-detail
Pane after homepage. Shows a single workflow definition: name, description, ordered step chain preview (step labels + types), list of past executions for this definition, "Start" button.

### definition-editor
Pane after definition-detail. UI for creating/editing a workflow definition: add/remove/reorder steps, select step type (from `Workflows.StepType` contributions), configure each step's config blob via the step type's own config UI. Used both for new definitions and editing existing ones.

### execution
User-facing pane for a single workflow execution. Progress rail on the left showing all steps with status indicators. Main area renders the active step's UI component (resolved from `Workflows.StepType` contributions by `stepPluginId`). Completed steps show output summaries. This is the pretty, interactive surface the end user sees.

### monitoring
Debug/developer pane for a single workflow execution. Shows the step progress graph with detailed state: step statuses, inputs/outputs (raw JSON), timing, engine job state, event/trigger state. For inspecting and debugging workflow runs, not for end-user interaction.

### steps (umbrella)
Empty namespace grouping step type plugins.

### steps/branch
Simplest step type. Pure synchronous logic — evaluates a condition on prior step outputs and returns a `branchKey` that the engine uses with `nextStepMapping` to route to different next steps. No UI component (invisible to the user). No external dependencies beyond the engine.

### steps/prompt-form
UI step type. Server executor suspends via `ctx.waitFor(userInputSubmitted)` until the user submits. Web component renders a form from `config.fields` (JSON-schema-like). On submit, POSTs to the engine's submit endpoint which emits the event and resumes the job.

### steps/agent
Agent step type. Server executor creates a conversation via `createConversation()` (memoized in `ctx.step` to avoid duplicates on replay), then suspends via `afterTurn()` until the agent finishes. Web component shows conversation status and links to the conversation view.

## Implementation Order

Each plugin is implemented by a separate agent. Dependencies determine the chain.

```
1. shell                    (no deps — app must exist first)
2. engine                   (depends on: shell)
3. steps (umbrella)         (no deps — empty namespace)
 ├─ 4. steps/branch         (depends on: engine)
 ├─ 5. steps/prompt-form    (depends on: engine)
 └─ 6. steps/agent          (depends on: engine)
7. homepage                 (depends on: engine, shell)
8. definition-detail        (depends on: engine, homepage)
9. definition-editor        (depends on: engine, definition-detail)
10. execution               (depends on: engine, homepage)
11. monitoring              (depends on: engine, homepage)
```

Parallelism:
- 3–6 can all run in parallel (after engine lands)
- 7 starts after engine
- 8, 9 are a sequential chain after 7
- 10, 11 can run in parallel after 7
