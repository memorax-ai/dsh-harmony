namespace Harmony

abbrev Generation := Nat

/-- Static metadata read from a plugin module before its Fiber is started. -/
structure PluginDecl (ServiceKey Module : Type) where
  inject : List ServiceKey
  provide : List ServiceKey
  entryModule : Module

/--
Patch ordering after provider-level `before` and `after` declarations have
been expanded to concrete Patch identifiers.
-/
structure PatchDecl (Patch Module : Type) where
  targets : List Module
  before : List Patch
  after : List Patch

/-- Exact loader input after profile composition and service isolation. -/
structure System
    (Entry Plugin ServiceKey Module Patch : Type) where
  pluginOf : Entry → Plugin
  plugin : Plugin → PluginDecl ServiceKey Module
  patch : Patch → PatchDecl Patch Module
  patchEnabled : Patch → Prop

namespace System

variable {Entry Plugin ServiceKey Module Patch : Type}

def Requires
    (system : System Entry Plugin ServiceKey Module Patch)
    (entry : Entry) (service : ServiceKey) : Prop :=
  service ∈ (system.plugin (system.pluginOf entry)).inject

def Provides
    (system : System Entry Plugin ServiceKey Module Patch)
    (entry : Entry) (service : ServiceKey) : Prop :=
  service ∈ (system.plugin (system.pluginOf entry)).provide

def PluginDependsOn
    (system : System Entry Plugin ServiceKey Module Patch)
    (consumer provider : Entry) : Prop :=
  ∃ service, system.Requires consumer service ∧ system.Provides provider service

def PatchTargets
    (system : System Entry Plugin ServiceKey Module Patch)
    (patch : Patch) (entry : Entry) : Prop :=
  (system.plugin (system.pluginOf entry)).entryModule ∈ (system.patch patch).targets

def PatchPrecedes
    (system : System Entry Plugin ServiceKey Module Patch)
    (left right : Patch) : Prop :=
  right ∈ (system.patch left).before ∨ left ∈ (system.patch right).after

end System

/-- Observable lifecycle phase of one Entry generation. -/
inductive Phase where
  | absent
  | pending
  | loading
  | active
  | unloading
  | failed
  | disposed
  deriving DecidableEq, Repr

namespace Phase

def Running : Phase → Prop
  | .loading | .active => True
  | _ => False

/-- A resident generation can still own effects or services. -/
def Resident : Phase → Prop
  | .loading | .active | .unloading => True
  | _ => False

end Phase

/-- Runtime facts required by the coordinator proof; implementation caches are omitted. -/
structure LoaderState (Entry Patch : Type) where
  phase : Entry → Generation → Phase
  committed : Entry → Option Generation
  patchPrepared : Patch → Generation → Prop

namespace LoaderState

variable {Entry Patch : Type}

def Running (state : LoaderState Entry Patch) (entry : Entry) (generation : Generation) : Prop :=
  (state.phase entry generation).Running

def Active (state : LoaderState Entry Patch) (entry : Entry) (generation : Generation) : Prop :=
  state.phase entry generation = .active

def Resident (state : LoaderState Entry Patch) (entry : Entry) (generation : Generation) : Prop :=
  (state.phase entry generation).Resident

end LoaderState

/-- Atomic actions exposed by a future loading algorithm. -/
inductive Action (Entry Patch : Type) where
  | preparePatch (patch : Patch) (generation : Generation)
  | start (entry : Entry) (generation : Generation)
  | activate (entry : Entry) (generation : Generation)
  | beginUnload (entry : Entry) (generation : Generation)
  | finishUnload (entry : Entry) (generation : Generation)
  | commit (entry : Entry) (generation : Generation)
  | fail (entry : Entry) (generation : Generation)
  deriving Repr

abbrev Plan (Entry Patch : Type) := List (Action Entry Patch)

end Harmony
