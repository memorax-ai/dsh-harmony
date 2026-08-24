import Harmony.Safety

namespace Harmony

namespace Plan

variable {Entry Plugin ServiceKey Module Patch : Type}

def Occurs (action : Action Entry Patch) (plan : Plan Entry Patch) : Prop :=
  ∃ initial rest, plan = initial ++ action :: rest

def Before
    (left right : Action Entry Patch)
    (plan : Plan Entry Patch) : Prop :=
  ∃ initial middle rest, plan = initial ++ left :: middle ++ right :: rest

/-- Every relevant Patch is prepared before the plugin generation starts. -/
def PatchesBeforeStart
    (system : System Entry Plugin ServiceKey Module Patch)
    (plan : Plan Entry Patch) : Prop :=
  ∀ entry generation patch,
    system.patchEnabled patch →
    system.PatchTargets patch entry →
    Occurs (.start entry generation) plan →
    Before (.preparePatch patch generation) (.start entry generation) plan

/-- Normalized Patch `before` and `after` declarations are respected. -/
def PatchOrderRespected
    (system : System Entry Plugin ServiceKey Module Patch)
    (plan : Plan Entry Patch) : Prop :=
  ∀ left right generation,
    system.patchEnabled left →
    system.patchEnabled right →
    system.PatchPrecedes left right →
    Occurs (.preparePatch left generation) plan →
    Occurs (.preparePatch right generation) plan →
    Before (.preparePatch left generation) (.preparePatch right generation) plan

/-- A new generation cannot start until the previous generation has fully unloaded. -/
def GenerationsSeparated (plan : Plan Entry Patch) : Prop :=
  ∀ entry previous next,
    previous ≠ next →
    Occurs (.beginUnload entry previous) plan →
    Occurs (.start entry next) plan →
    Before (.finishUnload entry previous) (.start entry next) plan

/-- Publication is always later than successful activation. -/
def CommitAfterActivate (plan : Plan Entry Patch) : Prop :=
  ∀ entry generation,
    Occurs (.commit entry generation) plan →
    Before (.activate entry generation) (.commit entry generation) plan

structure WellFormed
    (system : System Entry Plugin ServiceKey Module Patch)
    (plan : Plan Entry Patch) : Prop where
  patchesBeforeStart : PatchesBeforeStart system plan
  patchOrderRespected : PatchOrderRespected system plan
  generationsSeparated : GenerationsSeparated plan
  commitAfterActivate : CommitAfterActivate plan

end Plan

end Harmony
