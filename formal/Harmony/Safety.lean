import Harmony.Model

namespace Harmony

namespace LoaderState

variable {Entry Plugin ServiceKey Module Patch : Type}

/-- No Entry has two generations that can still own live resources. -/
def GenerationExclusive (state : LoaderState Entry Patch) : Prop :=
  ∀ entry left right,
    state.Resident entry left → state.Resident entry right → left = right

/-- A running consumer only observes services from active providers. -/
def DependencySafe
    (system : System Entry Plugin ServiceKey Module Patch)
    (state : LoaderState Entry Patch) : Prop :=
  ∀ consumer generation service,
    state.Running consumer generation → system.Requires consumer service →
      ∃ provider providerGeneration,
        state.Active provider providerGeneration ∧ system.Provides provider service

/-- Every Patch that can affect a running Entry was prepared for that generation. -/
def PatchComplete
    (system : System Entry Plugin ServiceKey Module Patch)
    (state : LoaderState Entry Patch) : Prop :=
  ∀ entry generation patch,
    state.Running entry generation →
    system.patchEnabled patch →
    system.PatchTargets patch entry →
    state.patchPrepared patch generation

/-- A committed generation is the active generation visible through the Loader Entry. -/
def CommitSound (state : LoaderState Entry Patch) : Prop :=
  ∀ entry generation,
    state.committed entry = some generation → state.Active entry generation

structure Safe
    (system : System Entry Plugin ServiceKey Module Patch)
    (state : LoaderState Entry Patch) : Prop where
  generationExclusive : state.GenerationExclusive
  dependencySafe : state.DependencySafe system
  patchComplete : state.PatchComplete system
  commitSound : state.CommitSound

/-- All prerequisites that must hold before plugin code may execute. -/
def CanStart
    (system : System Entry Plugin ServiceKey Module Patch)
    (state : LoaderState Entry Patch)
    (entry : Entry) (generation : Generation) : Prop :=
  (∀ service, system.Requires entry service →
    ∃ provider providerGeneration,
      state.Active provider providerGeneration ∧ system.Provides provider service) ∧
  (∀ patch, system.patchEnabled patch → system.PatchTargets patch entry →
    state.patchPrepared patch generation) ∧
  (∀ otherGeneration, state.Resident entry otherGeneration → otherGeneration = generation) ∧
  ¬ state.Resident entry generation ∧
  state.committed entry = none

/-- A provider may unload only after every running consumer has another active provider. -/
def CanBeginUnload
    (system : System Entry Plugin ServiceKey Module Patch)
    (state : LoaderState Entry Patch)
    (provider : Entry) : Prop :=
  ∀ consumer consumerGeneration service,
    state.Running consumer consumerGeneration →
    system.Requires consumer service →
    system.Provides provider service →
      ∃ replacement replacementGeneration,
        replacement ≠ provider ∧
        state.Active replacement replacementGeneration ∧
        system.Provides replacement service

end LoaderState

end Harmony
