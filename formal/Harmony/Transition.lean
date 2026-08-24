import Harmony.Safety

namespace Harmony

namespace LoaderState

variable {Entry Plugin ServiceKey Module Patch : Type}

def setPhase [DecidableEq Entry]
    (state : LoaderState Entry Patch)
    (entry : Entry) (generation : Generation) (phase : Phase) : LoaderState Entry Patch :=
  { state with
    phase := fun candidate candidateGeneration =>
      if candidate = entry ∧ candidateGeneration = generation then phase
      else state.phase candidate candidateGeneration }

def setCommitted [DecidableEq Entry]
    (state : LoaderState Entry Patch)
    (entry : Entry) (generation : Option Generation) : LoaderState Entry Patch :=
  { state with
    committed := fun candidate =>
      if candidate = entry then generation else state.committed candidate }

def start [DecidableEq Entry]
    (state : LoaderState Entry Patch)
    (entry : Entry) (generation : Generation) : LoaderState Entry Patch :=
  state.setPhase entry generation .loading

def activate [DecidableEq Entry]
    (state : LoaderState Entry Patch)
    (entry : Entry) (generation : Generation) : LoaderState Entry Patch :=
  state.setPhase entry generation .active

def commit [DecidableEq Entry]
    (state : LoaderState Entry Patch)
    (entry : Entry) (generation : Generation) : LoaderState Entry Patch :=
  state.setCommitted entry (some generation)

def beginUnload [DecidableEq Entry]
    (state : LoaderState Entry Patch)
    (entry : Entry) (generation : Generation) : LoaderState Entry Patch :=
  (state.setPhase entry generation .unloading).setCommitted entry none

@[simp] theorem setPhase_same [DecidableEq Entry]
    (state : LoaderState Entry Patch) (entry : Entry)
    (generation : Generation) (phase : Phase) :
    (state.setPhase entry generation phase).phase entry generation = phase := by
  simp [setPhase]

theorem setPhase_other [DecidableEq Entry]
    (state : LoaderState Entry Patch) (entry candidate : Entry)
    (generation candidateGeneration : Generation) (phase : Phase)
    (different : candidate ≠ entry ∨ candidateGeneration ≠ generation) :
    (state.setPhase entry generation phase).phase candidate candidateGeneration =
      state.phase candidate candidateGeneration := by
  simp only [setPhase]
  split
  · next h => exact False.elim (different.elim (fun ne => ne h.1) (fun ne => ne h.2))
  · rfl

@[simp] theorem setCommitted_same [DecidableEq Entry]
    (state : LoaderState Entry Patch) (entry : Entry)
    (generation : Option Generation) :
    (state.setCommitted entry generation).committed entry = generation := by
  simp [setCommitted]

theorem setCommitted_other [DecidableEq Entry]
    (state : LoaderState Entry Patch) (entry candidate : Entry)
    (generation : Option Generation) (different : candidate ≠ entry) :
    (state.setCommitted entry generation).committed candidate = state.committed candidate := by
  simp [setCommitted, different]

theorem start_preserves_generationExclusive [DecidableEq Entry]
    {system : System Entry Plugin ServiceKey Module Patch}
    {state : LoaderState Entry Patch} {entry : Entry} {generation : Generation}
    (safe : state.Safe system) (allowed : state.CanStart system entry generation) :
    (state.start entry generation).GenerationExclusive := by
  intro candidate left right leftResident rightResident
  by_cases candidateEntry : candidate = entry
  · subst candidate
    have residentGeneration : ∀ value,
        (state.start entry generation).Resident entry value → value = generation := by
      intro value resident
      by_cases sameGeneration : value = generation
      · exact sameGeneration
      · have oldResident : state.Resident entry value := by
          simpa [start, Resident, Phase.Resident, setPhase, sameGeneration]
            using resident
        exact allowed.2.2.1 value oldResident
    exact (residentGeneration left leftResident).trans
      (residentGeneration right rightResident).symm
  · have leftOld : state.Resident candidate left := by
      simpa [start, Resident, setPhase, candidateEntry] using leftResident
    have rightOld : state.Resident candidate right := by
      simpa [start, Resident, setPhase, candidateEntry] using rightResident
    exact safe.generationExclusive candidate left right leftOld rightOld

theorem start_preserves_dependencySafe [DecidableEq Entry]
    {system : System Entry Plugin ServiceKey Module Patch}
    {state : LoaderState Entry Patch} {entry : Entry} {generation : Generation}
    (safe : state.Safe system) (allowed : state.CanStart system entry generation) :
    (state.start entry generation).DependencySafe system := by
  have preservesActive : ∀ provider providerGeneration,
      state.Active provider providerGeneration →
      (state.start entry generation).Active provider providerGeneration := by
    intro provider providerGeneration active
    by_cases sameEntry : provider = entry
    · subst provider
      by_cases sameGeneration : providerGeneration = generation
      · subst providerGeneration
        have resident : state.Resident entry generation := by
          change (state.phase entry generation).Resident
          change state.phase entry generation = .active at active
          rw [active]
          trivial
        exact False.elim (allowed.2.2.2.1 resident)
      · simpa [start, Active, setPhase, sameGeneration] using active
    · simpa [start, Active, setPhase, sameEntry] using active
  intro consumer consumerGeneration service running requires
  by_cases sameEntry : consumer = entry
  · subst consumer
    by_cases sameGeneration : consumerGeneration = generation
    · rcases allowed.1 service requires with ⟨provider, providerGeneration, active, provides⟩
      exact ⟨provider, providerGeneration, preservesActive provider providerGeneration active, provides⟩
    · have oldRunning : state.Running entry consumerGeneration := by
        simpa [start, Running, Phase.Running, setPhase, sameGeneration] using running
      rcases safe.dependencySafe entry consumerGeneration service oldRunning requires with
        ⟨provider, providerGeneration, active, provides⟩
      exact ⟨provider, providerGeneration, preservesActive provider providerGeneration active, provides⟩
  · have oldRunning : state.Running consumer consumerGeneration := by
      simpa [start, Running, setPhase, sameEntry] using running
    rcases safe.dependencySafe consumer consumerGeneration service oldRunning requires with
      ⟨provider, providerGeneration, active, provides⟩
    exact ⟨provider, providerGeneration, preservesActive provider providerGeneration active, provides⟩

theorem start_preserves_patchComplete [DecidableEq Entry]
    {system : System Entry Plugin ServiceKey Module Patch}
    {state : LoaderState Entry Patch} {entry : Entry} {generation : Generation}
    (safe : state.Safe system) (allowed : state.CanStart system entry generation) :
    (state.start entry generation).PatchComplete system := by
  intro candidate candidateGeneration patch running enabled targets
  by_cases sameEntry : candidate = entry
  · subst candidate
    by_cases sameGeneration : candidateGeneration = generation
    · subst candidateGeneration
      exact allowed.2.1 patch enabled targets
    · have oldRunning : state.Running entry candidateGeneration := by
        simpa [start, Running, Phase.Running, setPhase, sameGeneration] using running
      exact safe.patchComplete entry candidateGeneration patch oldRunning enabled targets
  · have oldRunning : state.Running candidate candidateGeneration := by
      simpa [start, Running, setPhase, sameEntry] using running
    exact safe.patchComplete candidate candidateGeneration patch oldRunning enabled targets

theorem start_preserves_commitSound [DecidableEq Entry]
    {system : System Entry Plugin ServiceKey Module Patch}
    {state : LoaderState Entry Patch} {entry : Entry} {generation : Generation}
    (safe : state.Safe system) (allowed : state.CanStart system entry generation) :
    (state.start entry generation).CommitSound := by
  intro candidate committedGeneration committed
  by_cases sameEntry : candidate = entry
  · subst candidate
    have impossible : False := by
      have oldCommitted : state.committed entry = some committedGeneration := by
        simpa [start, setPhase] using committed
      rw [allowed.2.2.2.2] at oldCommitted
      cases oldCommitted
    exact impossible.elim
  · have oldCommitted : state.committed candidate = some committedGeneration := committed
    have oldActive := safe.commitSound candidate committedGeneration oldCommitted
    simpa [start, Active, setPhase, sameEntry] using oldActive

theorem start_preserves_safe [DecidableEq Entry]
    {system : System Entry Plugin ServiceKey Module Patch}
    {state : LoaderState Entry Patch} {entry : Entry} {generation : Generation}
    (safe : state.Safe system) (allowed : state.CanStart system entry generation) :
    (state.start entry generation).Safe system := by
  exact {
    generationExclusive := start_preserves_generationExclusive safe allowed
    dependencySafe := start_preserves_dependencySafe safe allowed
    patchComplete := start_preserves_patchComplete safe allowed
    commitSound := start_preserves_commitSound safe allowed
  }

theorem activate_preserves_safe [DecidableEq Entry]
    {system : System Entry Plugin ServiceKey Module Patch}
    {state : LoaderState Entry Patch} {entry : Entry} {generation : Generation}
    (safe : state.Safe system)
    (loading : state.phase entry generation = .loading)
    (notCommitted : state.committed entry = none) :
    (state.activate entry generation).Safe system := by
  have residentBack : ∀ candidate candidateGeneration,
      (state.activate entry generation).Resident candidate candidateGeneration →
      state.Resident candidate candidateGeneration := by
    intro candidate candidateGeneration resident
    by_cases sameEntry : candidate = entry
    · subst candidate
      by_cases sameGeneration : candidateGeneration = generation
      · subst candidateGeneration
        change (state.phase entry generation).Resident
        rw [loading]
        trivial
      · simpa [activate, Resident, setPhase, sameGeneration] using resident
    · simpa [activate, Resident, setPhase, sameEntry] using resident
  have runningBack : ∀ candidate candidateGeneration,
      (state.activate entry generation).Running candidate candidateGeneration →
      state.Running candidate candidateGeneration := by
    intro candidate candidateGeneration running
    by_cases sameEntry : candidate = entry
    · subst candidate
      by_cases sameGeneration : candidateGeneration = generation
      · subst candidateGeneration
        change (state.phase entry generation).Running
        rw [loading]
        trivial
      · simpa [activate, Running, setPhase, sameGeneration] using running
    · simpa [activate, Running, setPhase, sameEntry] using running
  have activeForward : ∀ candidate candidateGeneration,
      state.Active candidate candidateGeneration →
      (state.activate entry generation).Active candidate candidateGeneration := by
    intro candidate candidateGeneration active
    by_cases sameEntry : candidate = entry
    · subst candidate
      by_cases sameGeneration : candidateGeneration = generation
      · subst candidateGeneration
        exact setPhase_same state entry generation .active
      · simpa [activate, Active, setPhase, sameGeneration] using active
    · simpa [activate, Active, setPhase, sameEntry] using active
  refine {
    generationExclusive := ?_
    dependencySafe := ?_
    patchComplete := ?_
    commitSound := ?_
  }
  · intro candidate left right leftResident rightResident
    exact safe.generationExclusive candidate left right
      (residentBack candidate left leftResident)
      (residentBack candidate right rightResident)
  · intro consumer consumerGeneration service running requires
    rcases safe.dependencySafe consumer consumerGeneration service
      (runningBack consumer consumerGeneration running) requires with
      ⟨provider, providerGeneration, active, provides⟩
    exact ⟨provider, providerGeneration,
      activeForward provider providerGeneration active, provides⟩
  · intro candidate candidateGeneration patch running enabled targets
    exact safe.patchComplete candidate candidateGeneration patch
      (runningBack candidate candidateGeneration running) enabled targets
  · intro candidate committedGeneration committed
    by_cases sameEntry : candidate = entry
    · subst candidate
      have oldCommitted : state.committed entry = some committedGeneration := by
        simpa [activate, setPhase] using committed
      rw [notCommitted] at oldCommitted
      cases oldCommitted
    · have oldCommitted : state.committed candidate = some committedGeneration := committed
      exact activeForward candidate committedGeneration
        (safe.commitSound candidate committedGeneration oldCommitted)

theorem commit_preserves_safe [DecidableEq Entry]
    {system : System Entry Plugin ServiceKey Module Patch}
    {state : LoaderState Entry Patch} {entry : Entry} {generation : Generation}
    (safe : state.Safe system) (active : state.Active entry generation) :
    (state.commit entry generation).Safe system := by
  refine {
    generationExclusive := safe.generationExclusive
    dependencySafe := safe.dependencySafe
    patchComplete := safe.patchComplete
    commitSound := ?_
  }
  intro candidate committedGeneration committed
  by_cases sameEntry : candidate = entry
  · subst candidate
    simp [commit, setCommitted] at committed
    subst committedGeneration
    exact active
  · have oldCommitted : state.committed candidate = some committedGeneration := by
      simpa [commit, setCommitted, sameEntry] using committed
    exact safe.commitSound candidate committedGeneration oldCommitted

end LoaderState

end Harmony
