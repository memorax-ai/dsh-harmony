# dsh-harmony loader model

This Lean 4 project is the proof boundary for the Harmony plugin loader
coordinator. It deliberately models declarations and lifecycle facts, not YAML,
Node module resolution, AST transformation, or a particular scheduling
algorithm.

## Runtime mapping

- `Entry` identifies one Loader entry. Two mounts of the same plugin are two
  different entries.
- `Plugin` identifies the imported plugin declaration.
- `ServiceKey` is a service name after Cordis isolation has been resolved.
- `Module` is a canonical module identity.
- `Patch` is a concrete Harmony Patch identity. Provider-level `before` and
  `after` rules are expanded before entering the model.
- `Generation` is the outer Harmony reload generation.

`LoaderState.Safe` collects the invariants every optimized scheduler must
preserve:

1. a Loader entry cannot have two resident generations;
2. every running consumer has an active provider for every injected service;
3. every enabled Patch targeting a running plugin was prepared for the same
   generation;
4. the generation published through the Loader entry is active.

Future algorithms should produce a `Plan` and prove that every executed action
meets its admission predicate (`CanStart`, `CanBeginUnload`, and the later
commit predicates) and preserves `LoaderState.Safe`.

`Plan.WellFormed` is the static proof obligation for generated plans: Patches
must be prepared before their target starts, declared Patch order must be
respected, generations must not overlap, and commit must follow activation.

`Harmony.Transition` currently proves that admitted `start`, `activate`, and
`commit` operations preserve the complete safety invariant. The unloading
proof is intentionally kept separate because it depends on the exact reverse
dependency scheduling algorithm that will be designed next.

Run:

```sh
cd formal
lake build
```
