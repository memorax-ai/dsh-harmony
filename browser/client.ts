window.__ModuleLoader__.load({
  id: 'dsh-harmony',
  factory: (require) => {
    const module: BrowserPluginModule = { exports: {} }
    const exports = module.exports
    const React = require('react')
    const { createElement: h, useEffect, useLayoutEffect, useMemo, useRef, useState } = React

    const css = `
.dshHarmonyPage{height:100%;min-height:0;display:flex;flex-direction:column;gap:14px;color:var(--dsw-alias-label-primary)}
.dshHarmonySettingsPanel:has(.dshHarmonyPage){width:1200px}
.dshHarmonyTabs{flex:none;display:flex;gap:22px;border-bottom:1px solid var(--dsw-alias-border-l2)}
.dshHarmonyTab{position:relative;padding:0 2px 10px;border:0;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:13px;line-height:20px;cursor:pointer}
.dshHarmonyTab[aria-selected=true]{color:var(--dsw-alias-label-primary);font-weight:600}
.dshHarmonyTab[aria-selected=true]::after{content:'';position:absolute;right:0;bottom:-1px;left:0;height:2px;border-radius:2px 2px 0 0;background:var(--dsw-alias-state-business-primary)}
.dshHarmonyTab:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:2px}
.dshHarmonyHeading{margin:0;font-size:18px;line-height:26px;font-weight:600}
.dshHarmonyIntro{max-width:68ch;margin:2px 0 0;color:var(--dsw-alias-label-tertiary);font-size:13px;line-height:20px}
.dshHarmonyWarning{margin:0;padding:8px 10px;border:1px solid rgba(217,119,6,.24);border-radius:8px;background:rgba(217,119,6,.1);color:var(--dsw-alias-label-secondary);font-size:12px;line-height:19px}
.dshHarmonyWorkspace{flex:1;min-height:0;display:grid;grid-template-columns:minmax(250px,450px) minmax(0,1fr);gap:16px}
.dshHarmonyList{min-height:0;overflow-y:auto;display:flex;flex-direction:column;gap:10px;margin:0;padding:10px;list-style:none;border:1px solid var(--dsw-alias-border-l2);border-radius:14px;background:var(--dsw-alias-bg-layer-1);scrollbar-color:var(--dsw-alias-border-l2) transparent;scrollbar-width:thin}
.dshHarmonyStack{position:relative;width:100%;min-width:0;isolation:isolate}
.dshHarmonyStack[data-collapsed=true]{cursor:grab}
.dshHarmonyStack[data-collapsed=true]:active{cursor:grabbing}
.dshHarmonyStackCover{--dsh-card-border:var(--dsw-alias-border-l2);position:absolute;inset:0 0 auto;z-index:100;min-height:48px;border:1px solid var(--dsh-card-border);border-radius:10px;background:var(--dsw-alias-bg-layer-2);overflow:hidden}
.dshHarmonyStack[data-collapsed=true] .dshHarmonyStackCover{position:relative;inset:auto}
.dshHarmonyStack[data-expanded=true] .dshHarmonyStackCover{opacity:0;pointer-events:none}
.dshHarmonyPatchGrip{display:flex;align-items:center;justify-content:center;border:0;background:transparent;color:var(--dsw-alias-label-tertiary);cursor:grab;touch-action:none}
.dshHarmonyPatchGrip::before{content:'';width:12px;height:16px;background:radial-gradient(circle,currentColor 1.2px,transparent 1.4px) 0 0/6px 6px}
.dshHarmonyPatchGrip:active{cursor:grabbing}
.dshHarmonyPatchGrip:focus-visible,.dshHarmonyStackSummary:focus-visible,.dshHarmonyPatchCard:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:-3px}
.dshHarmonyStackSummary{width:100%;min-width:0;display:flex;align-items:center;gap:10px;padding:9px 11px;border:0;background:transparent;color:inherit;font:inherit;text-align:left;cursor:grab;user-select:none;touch-action:none}
.dshHarmonyStackSummary:active{cursor:grabbing}
.dshHarmonyStack[data-collapsed=true]:hover .dshHarmonyStackCover,.dshHarmonyPatchCard:hover{box-shadow:inset 0 0 0 1px var(--dsh-card-border)}
.dshHarmonyStack[data-selected=true] .dshHarmonyStackCover,.dshHarmonyPatchCard[data-selected=true]{box-shadow:inset 0 0 0 1px var(--dsh-card-border)}
.dshHarmonyList[data-has-selection=true]>.dshHarmonyStack:not([data-owner-selected=true]),.dshHarmonyList[data-has-selection=true]>.dshHarmonyPatchItem>.dshHarmonyPatchCard:not([data-owner-selected=true]){width:75%}
.dshHarmonyPatchCard[data-status=disabled],.dshHarmonyDragPatch[data-status=disabled],.dshHarmonyDragLayer[data-status=disabled]{--dsh-card-border:color-mix(in srgb,var(--dsw-alias-label-tertiary) 13%,var(--dsw-alias-border-l2));border-color:var(--dsh-card-border);background:color-mix(in srgb,var(--dsw-alias-label-tertiary) 7%,var(--dsw-alias-bg-layer-2));color:var(--dsw-alias-label-secondary)}
.dshHarmonyPatchCard[data-status=warning],.dshHarmonyDragPatch[data-status=warning],.dshHarmonyDragLayer[data-status=warning]{--dsh-card-border:color-mix(in srgb,#d97706 25%,var(--dsw-alias-border-l2));border-color:var(--dsh-card-border);background:color-mix(in srgb,#d97706 9%,var(--dsw-alias-bg-layer-2))}
.dshHarmonyPatchCard[data-status=error],.dshHarmonyDragPatch[data-status=error],.dshHarmonyDragLayer[data-status=error]{--dsh-card-border:color-mix(in srgb,var(--dsw-alias-state-error-primary) 22%,var(--dsw-alias-border-l2));border-color:var(--dsh-card-border);background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 7%,var(--dsw-alias-bg-layer-2))}
.dshHarmonyStack[data-dragging=true],.dshHarmonyPatchCard[data-dragging=true]{opacity:.54}
.dshHarmonyStackGlyph{flex:none;width:30px;height:30px;display:flex;align-items:center;justify-content:center;border-radius:8px;background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-secondary);font-size:12px;font-weight:650}
.dshHarmonyStackText,.dshHarmonyPatchText{min-width:0;flex:1;display:flex;flex-direction:column;gap:1px}
.dshHarmonyName,.dshHarmonyPatchName{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px;line-height:20px;font-weight:600}
.dshHarmonyStackMeta,.dshHarmonyPatchOwner{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-tertiary);font-size:10px;line-height:16px}
.dshHarmonyStackPatches{display:flex;flex-direction:column;gap:10px;margin:0;padding:0;list-style:none}
.dshHarmonyStack[data-collapsed=true] .dshHarmonyStackPatches{position:absolute;inset:0;display:block;pointer-events:none}
.dshHarmonyPatchItem{min-width:0}
.dshHarmonyStack[data-collapsed=true] .dshHarmonyPatchItem{position:absolute}
.dshHarmonyPatchCard{--dsh-card-border:var(--dsw-alias-border-l2);width:100%;min-height:48px;display:grid;grid-template-columns:30px 24px minmax(0,1fr) auto;align-items:center;gap:7px;padding:6px 9px 6px 0;border:1px solid var(--dsh-card-border);border-radius:10px;background:var(--dsw-alias-bg-layer-2);color:inherit;font:inherit;text-align:left;cursor:grab;user-select:none;touch-action:none}
.dshHarmonyPatchCard:active{cursor:grabbing}
.dshHarmonyDropSlot{height:10px;display:flex;align-items:center;padding:0 4px;pointer-events:none}
.dshHarmonyDropSlot::before{content:'';width:100%;height:2px;border-radius:2px;background:#3b82f6;box-shadow:0 0 4px #3b82f6,0 0 11px color-mix(in srgb,#3b82f6 72%,transparent)}
.dshHarmonyDragPreview{position:fixed;z-index:1400;pointer-events:none;filter:drop-shadow(0 10px 18px rgba(0,0,0,.18))}
.dshHarmonyDragPatch,.dshHarmonyDragCover,.dshHarmonyDragLayer{height:48px;box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2);border-radius:10px;background:var(--dsw-alias-bg-layer-2)}
.dshHarmonyDragPatch,.dshHarmonyDragCover{position:relative;z-index:30;display:flex;align-items:center;gap:9px;padding:8px 11px;color:var(--dsw-alias-label-primary)}
.dshHarmonyDragStack{position:relative}
.dshHarmonyDragLayer{position:absolute}
.dshHarmonyDragTitle{min-width:0;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px;line-height:20px;font-weight:600}
.dshHarmonyDragMeta{flex:none;color:var(--dsw-alias-label-tertiary);font-size:10px;line-height:16px}
.dshHarmonyIndex{color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums;font-size:10px;text-align:right}
.dshHarmonyOrderState{flex:none;width:8px;height:8px;border-radius:50%;background:var(--dsw-alias-label-tertiary)}
.dshHarmonyOrderState[data-state=bound]{background:var(--dsw-alias-state-business-primary)}
.dshHarmonyOrderState[data-state=failed]{background:var(--dsw-alias-state-error-primary)}
.dshHarmonyOrderState[data-state=disabled]{background:var(--dsw-alias-label-tertiary)}
.dshHarmonyPatchCard[data-status=warning] .dshHarmonyOrderState{background:#d97706}
.dshHarmonyPatchCard[data-status=error] .dshHarmonyOrderState{background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 78%,transparent)}
.dshHarmonyPatchCard[data-status=disabled] .dshHarmonyOrderState{background:color-mix(in srgb,var(--dsw-alias-label-tertiary) 72%,transparent)}
.dshHarmonyStackState{box-sizing:border-box;border:1px solid color-mix(in srgb,var(--dsw-alias-label-primary) 20%,transparent)}
.dshHarmonyDetail{min-width:0;min-height:0;display:flex;flex-direction:column;gap:12px;overflow-y:auto;padding-inline-end:10px}
.dshHarmonyPreview{position:relative;flex:none;aspect-ratio:16/9;display:flex;align-items:center;justify-content:center;overflow:hidden;border-radius:12px;background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-tertiary)}
.dshHarmonyPreviewImage{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.dshHarmonyPreviewImageDark{display:none}
body[data-ds-dark-theme] .dshHarmonyPreviewImageLight{display:none}
body[data-ds-dark-theme] .dshHarmonyPreviewImageDark{display:block}
.dshHarmonyPreviewMark{width:56px;height:56px;display:flex;align-items:center;justify-content:center;border-radius:12px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary);font-size:22px;font-weight:600}
.dshHarmonyPreviewLabel{position:absolute;right:10px;bottom:8px;font-size:11px}
.dshHarmonyNavIcon{display:inline-block;width:16px;height:16px;background:currentColor;-webkit-mask:url('/dsh-harmony/assets/harmony-icon-mono.png') center/contain no-repeat;mask:url('/dsh-harmony/assets/harmony-icon-mono.png') center/contain no-repeat}
.dshHarmonyIdentity{display:flex;flex-direction:column;gap:2px}
.dshHarmonyMeta{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}
.dshHarmonyTitle{min-width:0;margin:0;overflow-wrap:anywhere;font-size:16px;line-height:24px;font-weight:600}
.dshHarmonyVersion{flex:none;color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:20px}
.dshHarmonyScope{margin:0;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}
.dshHarmonyDescription{max-width:70ch;margin:0;color:var(--dsw-alias-label-secondary);font-size:13px;line-height:21px;text-wrap:pretty}
.dshHarmonyConstraint{margin:0;padding:9px 10px;border-radius:8px;background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-secondary);font-size:12px;line-height:19px}
.dshHarmonyFacts{display:flex;flex-wrap:wrap;gap:6px 14px;margin:0;color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:18px}
.dshHarmonyFacts a{color:var(--dsw-alias-state-business-primary);text-decoration:none}
.dshHarmonyFacts a:hover{text-decoration:underline}
.dshHarmonyFacts a:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:2px}
.dshHarmonyDetailActions{display:flex;flex-wrap:wrap;gap:8px;padding-top:2px}
.dshHarmonyPatchPage{flex:1;min-height:0;display:flex;flex-direction:column;gap:14px}
.dshHarmonyPatchWorkspace{flex:1;min-height:0;display:grid;grid-template-columns:minmax(220px,320px) minmax(0,1fr);gap:14px}
.dshHarmonyPatchList{min-height:0;overflow:auto;display:flex;flex-direction:column;gap:5px;margin:0;padding:6px;list-style:none;border:1px solid var(--dsw-alias-border-l2);border-radius:12px;background:var(--dsw-alias-bg-layer-1)}
.dshHarmonyPatchRow{width:100%;display:grid;grid-template-columns:8px minmax(0,1fr);align-items:start;gap:9px;padding:9px;border:0;border-radius:9px;background:transparent;color:inherit;font:inherit;text-align:left;cursor:pointer}
.dshHarmonyPatchRow:hover{background:var(--dsw-alias-interactive-bg-hover)}
.dshHarmonyPatchRow[aria-current=true]{background:var(--dsw-specific-sidebar-nav-item-active)}
.dshHarmonyPatchRow:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:-2px}
.dshHarmonyPatchState{width:8px;height:8px;margin-top:6px;border-radius:50%;background:var(--dsw-alias-label-tertiary)}
.dshHarmonyPatchState[data-state=bound]{background:var(--dsw-alias-state-business-primary)}
.dshHarmonyPatchState[data-state=warning]{background:#d97706}
.dshHarmonyPatchState[data-state=failed]{background:var(--dsw-alias-state-error-primary)}
.dshHarmonyPatchState[data-state=disabled]{background:var(--dsw-alias-label-tertiary)}
.dshHarmonyPatchRowText{min-width:0;display:flex;flex-direction:column;gap:1px}
.dshHarmonyPatchRowTitle{min-width:0;display:flex;align-items:baseline;gap:7px}
.dshHarmonyPatchKey{min-width:0;flex:1;display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;line-height:19px;font-weight:600}
.dshHarmonyPatchRowStatus{flex:none;color:var(--dsw-alias-label-secondary);font-size:10px;line-height:17px}
.dshHarmonyPatchProvider,.dshHarmonyPatchTarget{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:17px}
.dshHarmonyPatchTarget{font-size:10px}
.dshHarmonyPatchDetail{min-width:0;min-height:0;overflow:auto;display:flex;flex-direction:column;gap:12px;padding:14px;border:1px solid var(--dsw-alias-border-l2);border-radius:12px;background:var(--dsw-alias-bg-layer-1)}
.dshHarmonyPatchHeader{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}
.dshHarmonySourceSections{--dsh-harmony-source-divider:color-mix(in srgb,var(--dsw-alias-label-primary) 10%,var(--dsw-alias-bg-layer-1));min-width:0;display:flex;flex-direction:column}
.dshHarmonySourceSection{flex:none;border-top:1px solid var(--dsh-harmony-source-divider)}
.dshHarmonySourceSection:last-child{border-bottom:1px solid var(--dsh-harmony-source-divider)}
.dshHarmonySourceSummary{position:sticky;top:-14px;z-index:4;width:100%;display:grid;grid-template-columns:6px minmax(0,1fr);column-gap:8px;padding:9px 4px;border:0;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;font-weight:600;line-height:18px;text-align:left;cursor:pointer}
.dshHarmonySourceSummary::before{content:'';grid-row:1;align-self:center;width:6px;height:6px;border-right:1.5px solid currentColor;border-bottom:1.5px solid currentColor;transform:rotate(-45deg);transition:transform .16s ease-out}
.dshHarmonySourceSection[data-open=true]>.dshHarmonySourceSummary{box-shadow:0 1px 0 var(--dsh-harmony-source-divider)}
.dshHarmonySourceSection[data-open=true]>.dshHarmonySourceSummary::before{transform:rotate(45deg)}
.dshHarmonySourceSummary:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:-2px}
.dshHarmonySourceTitle{grid-column:2;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dshHarmonySourceMeta{grid-column:2;display:none;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-tertiary);font-size:10px;font-weight:400;line-height:16px}
.dshHarmonySourceSection[data-open=true] .dshHarmonySourceMeta{display:block}
.dshHarmonyHorizontalViewport{overflow-x:auto;overflow-y:hidden;scrollbar-width:none}
.dshHarmonyHorizontalViewport::-webkit-scrollbar{height:0}
.dshHarmonyPatchCode{margin:0;padding:12px 6px;color:var(--dsw-alias-label-secondary);font:11px/18px ui-monospace,SFMono-Regular,Menlo,monospace;white-space:pre}
.dshHarmonyDiff{display:grid;font:11px/18px ui-monospace,SFMono-Regular,Menlo,monospace}
.dshHarmonyHorizontalRail{position:sticky;bottom:-14px;z-index:3;height:12px;overflow-x:scroll;overflow-y:hidden;background:var(--dsw-alias-bg-layer-1);scrollbar-width:none;cursor:pointer;touch-action:none}
.dshHarmonyHorizontalRail::-webkit-scrollbar{height:0}
.dshHarmonyHorizontalSpacer{display:block;height:1px}
.dshHarmonyHorizontalThumb{position:absolute;top:2px;left:0;height:8px;border-radius:8px;background:color-mix(in srgb,var(--dsw-alias-label-tertiary) 32%,transparent);cursor:grab;transition:background .14s ease-out}
.dshHarmonyHorizontalThumb:hover{background:color-mix(in srgb,var(--dsw-alias-label-tertiary) 48%,transparent)}
.dshHarmonyHorizontalRail:active .dshHarmonyHorizontalThumb{background:color-mix(in srgb,var(--dsw-alias-label-tertiary) 62%,transparent);cursor:grabbing}
.dshHarmonyDiffRow{min-width:max-content;display:grid;grid-template-columns:42px 42px 18px minmax(0,1fr)}
.dshHarmonyDiffRow[data-kind=added]{background:color-mix(in srgb,var(--dsw-alias-state-success-primary) 10%,transparent)}
.dshHarmonyDiffRow[data-kind=removed]{background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 9%,transparent)}
.dshHarmonyDiffLine{padding-inline:7px;color:var(--dsw-alias-label-tertiary);background:color-mix(in srgb,var(--dsw-alias-bg-module-platform) 72%,transparent);text-align:right;user-select:none}
.dshHarmonyDiffMark{text-align:center;color:var(--dsw-alias-label-tertiary);user-select:none}
.dshHarmonyDiffRow[data-kind=added] .dshHarmonyDiffMark{color:var(--dsw-alias-state-success-primary)}
.dshHarmonyDiffRow[data-kind=removed] .dshHarmonyDiffMark{color:var(--dsw-alias-state-error-primary)}
.dshHarmonyDiffCode{padding-inline:6px 12px;color:var(--dsw-alias-label-secondary);white-space:pre}
.dshHarmonyDiffGap .dshHarmonyDiffCode{color:var(--dsw-alias-label-tertiary);font-style:italic}
.dshHarmonyDiffEmpty{margin:0;padding:11px 12px;color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:18px}
.dshHarmonyPatchChain{display:flex;flex-wrap:wrap;gap:6px}
.dshHarmonyPatchChain span{padding:3px 7px;border-radius:6px;background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-secondary);font-size:10px;line-height:16px}
.dshHarmonyFooter{flex:none;display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:30px}
.dshHarmonyFooterActions{display:flex;align-items:center;gap:8px}
.dshHarmonyHint{margin:0;color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:18px}
.dshHarmonyWorkerCard{list-style:none;border:1px solid var(--dsw-alias-border-l2);border-radius:12px;background:var(--dsw-alias-bg-layer-3)}
.dshHarmonyWorkerCard:hover{border-color:var(--dsw-alias-label-dimmed)}
.dshHarmonyWorkerCard[data-open=true]{border-color:var(--dsw-alias-label-dimmed);background:var(--dsw-alias-bg-layer-2)}
.dshHarmonyWorkerHeader{position:relative;display:flex;align-items:center;gap:12px;padding:14px 16px}
.dshHarmonyWorkerHeaderButton{appearance:none;position:absolute;inset:0;z-index:0;width:100%;border:0;border-radius:12px;background:transparent;color:inherit;font:inherit;cursor:pointer}
.dshHarmonyWorkerHeaderButton:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:-2px}
.dshHarmonyWorkerText{position:relative;z-index:1;min-width:0;flex:1;display:flex;flex-direction:column;gap:4px;pointer-events:none}
.dshHarmonyWorkerTitleRow{display:flex;align-items:baseline;gap:8px;min-width:0;flex-wrap:wrap}
.dshHarmonyWorkerTitle{color:var(--dsw-alias-label-primary);font-size:16px;font-weight:600;line-height:24px}
.dshHarmonyWorkerPlugin{max-width:100%;overflow:hidden;color:var(--dsw-alias-label-caption);font-size:12px;font-weight:400;line-height:18px;text-decoration:none;text-overflow:ellipsis;white-space:nowrap;opacity:.38;pointer-events:auto}
.dshHarmonyWorkerPlugin:hover{color:var(--dsw-alias-label-secondary);opacity:.72}
.dshHarmonyWorkerPlugin[data-ready=true],.dshHarmonyWorkerPlugin:focus-visible{color:var(--dsw-alias-state-business-primary);opacity:1}
.dshHarmonyWorkerPlugin:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:2px;border-radius:2px}
.dshHarmonyWorkerDescription{max-width:70ch;color:var(--dsw-alias-label-tertiary);font-size:13px;line-height:1.5}
.dshHarmonyWorkerChevron{position:relative;z-index:1;flex:none;color:var(--dsw-alias-label-tertiary);pointer-events:none}
.dshHarmonyWorkerCard[data-open=true] .dshHarmonyWorkerChevron{transform:rotate(180deg)}
.dshHarmonyWorkerBody{display:flex;flex-direction:column;gap:10px;margin:0 16px;padding:12px 0 14px;border-top:1px solid var(--dsw-alias-border-l2)}
.dshHarmonyWorkerSetting{display:flex;align-items:center;justify-content:space-between;gap:12px 20px;flex-wrap:wrap}
.dshHarmonyWorkerSettingText{min-width:0;flex:1 1 280px;display:flex;flex-direction:column;gap:2px}
.dshHarmonyWorkerSettingTitle{color:var(--dsw-alias-label-primary);font-size:13px;font-weight:600;line-height:20px}
.dshHarmonyWorkerSettingDescription{max-width:70ch;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}
.dshHarmonyWorkerControl{flex:none;display:flex;align-items:center;gap:12px}
.dshHarmonyWorkerFieldLabel{color:var(--dsw-alias-label-primary);font-size:12px;font-weight:500;line-height:18px}
.dshHarmonyWorkerSelect{height:34px;min-width:112px;padding:0 12px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;line-height:20px;cursor:pointer}
.dshHarmonyWorkerSelect:hover:not(:disabled){border-color:var(--dsw-alias-label-dimmed);background:var(--dsw-alias-bg-module-platform)}
.dshHarmonyWorkerSelect:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:2px}
.dshHarmonyWorkerSelect:disabled{cursor:default;color:var(--dsw-alias-label-tertiary);opacity:.62}
.dshHarmonyWorkerError{margin:0;color:var(--dsw-alias-state-error-primary);font-size:12px;line-height:18px}
.dshHarmonySrOnly{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap;border:0}
.dshHarmonyButton{min-width:68px;height:30px;padding:0 12px;border:0;border-radius:8px;background:var(--dsw-alias-state-business-primary);color:#fff;font:inherit;font-size:13px;cursor:pointer}
.dshHarmonyButton:hover:not(:disabled){filter:brightness(.96)}
.dshHarmonyButton:focus-visible,.dshHarmonySecondary:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:2px}
.dshHarmonyButton:disabled{cursor:default;background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-tertiary)}
.dshHarmonySecondary{height:30px;padding:0 12px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;cursor:pointer}
.dshHarmonySecondary:disabled{cursor:default;color:var(--dsw-alias-label-tertiary);opacity:.62}
.dshHarmonyStatus{margin:auto;color:var(--dsw-alias-label-tertiary);font-size:13px}
.dshHarmonyError{color:var(--dsw-alias-state-error-primary)}
.dshHarmonySkeleton{height:100%;min-height:420px;display:grid;grid-template-columns:2fr 3fr;gap:14px}
.dshHarmonySkeleton>div{border-radius:12px;background:var(--dsw-alias-bg-module-platform)}
.dshHarmonyConfirmLayer{position:fixed;inset:0;z-index:1100;display:flex;align-items:center;justify-content:center;background:var(--dsw-alias-bg-mask-1)}
.dshHarmonyConfirm{width:min(380px,calc(100vw - 48px));padding:20px;border-radius:14px;background:var(--dsw-alias-bg-layer-2);box-shadow:var(--dsw-shadow-lv3)}
.dshHarmonyConfirm h3{margin:0 0 8px;font-size:16px;line-height:24px}
.dshHarmonyConfirm p{margin:0;color:var(--dsw-alias-label-secondary);font-size:13px;line-height:21px}
.dshHarmonyConfirmActions{display:flex;justify-content:flex-end;gap:8px;margin-top:18px}
.dshHarmonyRuntimeLayer{position:fixed;inset:0;z-index:1100;display:flex;align-items:center;justify-content:center;padding:24px;background:var(--dsw-alias-bg-mask-1)}
.dshHarmonyRuntimeDialog{width:min(520px,100%);padding:22px;border-radius:14px;background:var(--dsw-alias-bg-layer-2);box-shadow:var(--dsw-shadow-lv3)}
.dshHarmonyRuntimeDialog.dshHarmonyPatchDialog{width:min(680px,100%);max-height:min(720px,calc(100dvh - 48px));display:flex;flex-direction:column}
.dshHarmonyRuntimeDialog h2{margin:0;font-size:18px;line-height:26px;text-wrap:balance}
.dshHarmonyRuntimeDialog p{max-width:68ch;margin:8px 0 0;color:var(--dsw-alias-label-secondary);font-size:13px;line-height:21px;text-wrap:pretty}
.dshHarmonyRuntimeError{color:var(--dsw-alias-state-error-primary)!important;overflow-wrap:anywhere}
.dshHarmonyRuntimeActions{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:8px;margin-top:20px}
.dshHarmonySessionDiff{min-height:0;overflow:auto;display:flex;flex-direction:column;gap:10px;margin:16px -4px 0 0;padding:1px 4px 1px 1px;scrollbar-color:var(--dsw-alias-border-l2) transparent;scrollbar-width:thin}
.dshHarmonySessionDiffCard{flex:none;min-width:0;overflow:hidden;border:1px solid var(--dsw-alias-border-l2);border-radius:10px;background:var(--dsw-alias-bg-layer-3)}
.dshHarmonySessionDiffHeader{display:flex;align-items:center;gap:8px;padding:9px 11px}
.dshHarmonySessionDiffState{flex:none;width:8px;height:8px;border-radius:50%;background:var(--dsw-alias-label-tertiary)}
.dshHarmonySessionDiffCard[data-kind=missing] .dshHarmonySessionDiffState{background:var(--dsw-alias-state-error-primary)}
.dshHarmonySessionDiffCard[data-kind=added] .dshHarmonySessionDiffState{background:var(--dsw-alias-state-success-primary)}
.dshHarmonySessionDiffCard[data-kind=changed] .dshHarmonySessionDiffState{background:#d97706}
.dshHarmonySessionDiffCard[data-kind=reordered] .dshHarmonySessionDiffState{background:var(--dsw-alias-state-business-primary)}
.dshHarmonySessionDiffTitle{min-width:0;flex:1;margin:0;color:var(--dsw-alias-label-primary);font-size:12px;line-height:19px;font-weight:600}
.dshHarmonySessionDiffCount{flex:none;min-width:22px;padding:1px 6px;border-radius:6px;background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-secondary);font-size:10px;line-height:16px;text-align:center;font-variant-numeric:tabular-nums}
.dshHarmonySessionPatchList{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(250px,100%),1fr));gap:1px;margin:0;padding:1px 0 0;list-style:none;background:var(--dsw-alias-border-l2)}
.dshHarmonySessionPatch{min-width:0;display:grid;grid-template-columns:8px minmax(0,1fr);align-items:start;gap:9px;padding:8px 11px}
.dshHarmonySessionPatch{background:var(--dsw-alias-bg-layer-3)}
.dshHarmonySessionPatchState{width:8px;height:8px;margin-top:5px;border-radius:50%;background:var(--dsw-alias-label-tertiary)}
.dshHarmonySessionDiffCard[data-kind=missing] .dshHarmonySessionPatchState{background:var(--dsw-alias-state-error-primary)}
.dshHarmonySessionDiffCard[data-kind=added] .dshHarmonySessionPatchState{background:var(--dsw-alias-state-success-primary)}
.dshHarmonySessionDiffCard[data-kind=changed] .dshHarmonySessionPatchState{background:#d97706}
.dshHarmonySessionPatchText{min-width:0;display:flex;flex-direction:column;gap:1px}
.dshHarmonySessionPatchName{overflow:hidden;color:var(--dsw-alias-label-primary);font-size:12px;line-height:18px;font-weight:600;text-overflow:ellipsis;white-space:nowrap}
.dshHarmonySessionPatchOwner{overflow:hidden;color:var(--dsw-alias-label-tertiary);font-size:10px;line-height:16px;text-overflow:ellipsis;white-space:nowrap}
.dshHarmonySessionProfile{display:grid;grid-template-columns:minmax(0,1fr) 18px minmax(0,1fr);align-items:center;gap:8px;padding:0 11px 10px}
.dshHarmonySessionProfile code{min-width:0;overflow:hidden;padding:5px 7px;border-radius:6px;background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-primary);font-family:var(--dsw-font-family-code,monospace);font-size:11px;line-height:18px;text-align:center;text-overflow:ellipsis;white-space:nowrap}
.dshHarmonySessionProfileArrow{color:var(--dsw-alias-label-tertiary);font-size:12px;text-align:center}
.dshHarmonyRuntimeDialog .dshHarmonySessionReordered{margin:0;padding:0 11px 10px;color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:18px}
.dshHarmonyDanger{color:var(--dsw-alias-state-error-primary)}
.dshHarmonyToast{position:fixed;z-index:1200;top:24px;left:50%;display:flex;align-items:center;gap:9px;max-width:min(560px,calc(100vw - 32px));padding:10px 14px;border:1px solid var(--dsw-alias-border-l2);border-radius:10px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);box-shadow:var(--dsw-shadow-lv2);font-size:13px;line-height:20px;transform:translateX(-50%)}
.dshHarmonyToastDot{flex:none;width:8px;height:8px;border-radius:50%;background:var(--dsw-alias-state-business-primary)}
.dshHarmonyToast[data-state=failed] .dshHarmonyToastDot{background:var(--dsw-alias-state-error-primary)}
@media(max-width:680px){[role=dialog]:has(.dshHarmonyPage){max-width:calc(100vw - 24px)}[role=dialog]:has(.dshHarmonyPage)>nav{width:52px;gap:10px;padding:16px 6px 0}[role=dialog]:has(.dshHarmonyPage)>nav>div:first-child,[role=dialog]:has(.dshHarmonyPage)>nav button>span:last-child{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}[role=dialog]:has(.dshHarmonyPage)>nav button{justify-content:center;width:40px;padding:9px}[role=dialog]:has(.dshHarmonyPage)>div:last-child>div:last-child{padding-right:12px;padding-bottom:12px;padding-left:12px}.dshHarmonyPage{gap:8px}.dshHarmonyTabs{gap:12px}.dshHarmonyTab{padding-bottom:7px;font-size:11px}.dshHarmonyHeading{font-size:16px;line-height:22px}.dshHarmonyIntro{display:none}.dshHarmonyWorkspace,.dshHarmonyPatchWorkspace{display:block;overflow-y:auto}.dshHarmonyList,.dshHarmonyPatchList{min-height:220px;max-height:360px;padding:5px;gap:8px;border-radius:10px}.dshHarmonyDetail,.dshHarmonyPatchDetail{display:none}.dshHarmonyStackSummary{gap:4px;padding:8px 5px}.dshHarmonyStackGlyph{display:none}.dshHarmonyStackMeta{font-size:9px}.dshHarmonyPatchCard{grid-template-columns:22px minmax(0,1fr) auto;gap:4px;padding-right:5px}.dshHarmonyPatchGrip{display:none}.dshHarmonyIndex{font-size:9px}.dshHarmonyFooter{align-items:stretch;flex-direction:column}.dshHarmonyHint{display:none}.dshHarmonyButton{width:100%}.dshHarmonyFooterActions{width:100%}.dshHarmonyFooterActions>.dshHarmonyButton,.dshHarmonyFooterActions>.dshHarmonySecondary{width:auto;flex:1}.dshHarmonySkeleton{grid-template-columns:1fr}.dshHarmonyRuntimeLayer{padding:12px}.dshHarmonyRuntimeDialog.dshHarmonyPatchDialog{max-height:calc(100dvh - 24px);padding:18px}.dshHarmonySessionPatchList{grid-template-columns:minmax(0,1fr)}.dshHarmonyRuntimeActions>.dshHarmonyButton,.dshHarmonyRuntimeActions>.dshHarmonySecondary{width:auto;min-width:0;flex:1}}
@media(prefers-reduced-motion:no-preference){.dshHarmonySettingsPanel{transition:width .28s cubic-bezier(.16,1,.3,1)}.dshHarmonyStack{transition:width .22s cubic-bezier(.16,1,.3,1)}.dshHarmonyStackCover{transition:opacity .11s ease-out,box-shadow .16s ease-out}.dshHarmonyStack[data-collapsed=true] .dshHarmonyStackCover{transition:opacity .14s ease-out .14s,box-shadow .16s ease-out}.dshHarmonyPatchCard{transition:width .22s cubic-bezier(.16,1,.3,1),opacity .16s ease-out,box-shadow .16s ease-out}.dshHarmonyDropSlot{animation:dshHarmonyDropIn .13s cubic-bezier(.16,1,.3,1)}.dshHarmonyToast{animation:dshHarmonyToastIn .18s ease-out}.dshHarmonyWorkerCard{transition:border-color .16s ease-out,background .16s ease-out}.dshHarmonyWorkerPlugin{transition:color .16s ease-out,opacity .16s ease-out}.dshHarmonyWorkerChevron{transition:transform .16s ease-out}.dshHarmonyWorkerSelect{transition:border-color .16s ease-out,background .16s ease-out}}
@keyframes dshHarmonyToastIn{from{opacity:0;transform:translate(-50%,-8px)}to{opacity:1;transform:translate(-50%,0)}}
@keyframes dshHarmonyDropIn{from{height:0;opacity:0}to{height:10px;opacity:1}}
`
    const styleId = 'dsh-harmony/client.css'
    const existingStyle = document.querySelector<HTMLStyleElement>(`style[data-plugin-css="${styleId}"]`)
    if (existingStyle === null) {
      const style = document.createElement('style')
      style.dataset.plugin = 'dsh-harmony'
      style.dataset.pluginCss = styleId
      style.textContent = css
      document.head.appendChild(style)
    } else existingStyle.textContent = css

    const dictionaries = {
      zh: {
        nav: 'Harmony',
        orderPage: '应用顺序',
        patchPage: 'Patch 状态',
        harmonySettingsTitle: 'Harmony',
        harmonySettingsDescription: '集中管理 Harmony 的 Patch 装载和运行时选项。',
        harmonySettingsExpand: '展开 Harmony 设置',
        harmonySettingsCollapse: '收起 Harmony 设置',
        workerThreadsTitle: '多线程装载',
        workerThreadsDescription: '并行处理互不依赖的源码 Patch 文件组。1 为兼容模式；修改后从下一次 Patch 装载生效，提高线程数会增加内存占用。',
        workerThreadsField: '装载线程数',
        workerThreadsOption: '线程',
        workerThreadsSaving: '正在保存线程设置…',
        workerThreadsError: '无法保存线程设置。',
        patchTitle: '运行时 Patch',
        patchIntro: '只读监视 Patch 的绑定、兼容性和当前变换结果。',
        patchEmpty: '当前没有 Harmony Patch。安装或启用一个声明了 Patch 的插件后，它会显示在这里。',
        patchSelect: '选择一个 Patch 查看详情。',
        noPatchDescription: '这个 Patch 没有提供作用说明。',
        viewPatchDetails: '查看详情',
        patchTarget: '目标',
        patchVersion: '版本范围',
        patchMatches: '匹配数',
        patchGeneration: '运行代次',
        patchOperation: '操作',
        patchProvider: '插件',
        patchDeclaration: '声明文件',
        patchChain: '变换链',
        patchOriginal: '原始源码',
        patchIntermediate: '中间结果',
        patchFinal: '最终源码',
        patchNoChanges: '这一步没有产生源码变化。',
        patchDiffLimited: '变更过大，已跳过 Diff 计算；仍可查看原始源码和最终源码。',
        diffAdded: '新增行',
        diffRemoved: '删除行',
        patchPending: '等待目标加载',
        patchBound: '已启用',
        patchHealthy: '健康',
        patchWarning: '警告',
        patchDisabled: '已停用',
        patchFailed: '失败',
        patchKindSource: '源码 Patch',
        patchKindSemantic: '语义 Patch',
        patchKindLoader: '加载器 Patch',
        patchKindComposite: '组合 Patch',
        patchOperationBefore: '之前执行',
        patchOperationAfter: '之后执行',
        patchOperationAround: '环绕执行',
        patchOperationReplace: '替换',
        enablePatch: '启用此 Patch',
        disablePatch: '停用此 Patch',
        enablePluginPatches: '启用此插件 Patch',
        disablePluginPatches: '停用此插件 Patch',
        author: '作者',
        contributors: '贡献者',
        homepage: '主页',
        bugs: '问题反馈',
        license: '许可证',
        patchCount: 'Patch',
        patchCountOne: 'Patch',
        showPatch: '显示 Patch 卡片',
        title: 'Patch 应用顺序',
        intro: '拖动插件封面移动整堆；展开后可将单个 Patch 拖到任意位置。',
        expandStack: '展开 Patch 卡片堆',
        collapseStack: '折叠 Patch 卡片堆',
        dropAt: '放到第',
        orderEmpty: '当前没有可排序的 Harmony Patch。',
        preview: '插件示意图占位',
        noDescription: '这个插件没有提供介绍。',
        before: '需要位于这些插件之前',
        after: '需要位于这些插件之后',
        requires: '需要这些插件',
        conflicts: '与这些插件冲突',
        integrates: '可与这些插件联动',
        compatibilityWarning: '检测到兼容性问题；Harmony 不会自动改变插件状态：',
        requirementMissing: '缺失',
        requirementInactive: '未启用',
        requirementVersion: '版本不符',
        keyboard: '长按卡片召回同插件 Patch · 拖动封面或单个 Patch · 滚轮仍可滚动',
        movedTo: '已移至第',
        positionOf: '位，共',
        positionUnit: ' 位',
        save: '保存',
        undo: '撤回',
        saving: '保存中…',
        loading: '正在读取 Patch 顺序…',
        loadError: '无法读取 Patch 顺序。',
        retry: '重试',
        confirmTitle: '保存 Patch 顺序？',
        confirmBody: '退出设置前，可以保存并热加载新的 Patch 顺序，也可以放弃这次调整。',
        saveExit: '保存并退出',
        discard: '不保存',
        cancel: '取消',
        runtimeTitle: '需要安装 Harmony 启动器',
        runtimeBody: '插件已经添加到当前配置，但这个 dsh 进程尚未启用 Harmony。Patch 只有在启动器安装并重新启动 dsh 后才会生效。',
        runtimeDesktopTitle: 'Desktop 尚未通过 Harmony 启动',
        runtimeDesktopBody: '请配置 Desktop Host 入口，或升级到支持自定义 Host 入口的 Desktop 版本。安装全局启动器不会修改 Desktop 内置 Host。',
        runtimeInstalled: '启动器已安装。下次启动 dsh 时将自动启用 Harmony。',
        runtimeWorking: '正在处理…',
        runtimeError: '操作失败',
        sessionPatchMissing: '当前缺失',
        sessionPatchAdded: '当前新增',
        sessionPatchChanged: '实现已变化',
        sessionPatchReordered: '应用顺序已变化',
        sessionPatchReorderedBody: 'Patch 内容相同，但应用顺序与记录状态不同。',
        instancePatchTitle: '实例数据使用了不同的 Patch 配置',
        instancePatchBody: '这个 DSH_HOME 上次由另一个有序 Patch profile 启动。当前实例已经继续启动并记录新状态；请确认下面的变化符合预期。',
        instancePatchProfiles: 'Profile',
        instancePatchDismiss: '我知道了',
        reloadStarting: 'Harmony 正在重载',
        reloadSucceeded: 'Harmony 重载成功',
        reloadFailed: 'Harmony 重载失败',
        install: '安装',
        installRestart: '安装并重启',
        removePlugin: '移除插件',
        ignoreOnce: '本次忽略',
        done: '完成',
      },
      en: {
        nav: 'Harmony',
        orderPage: 'Apply order',
        patchPage: 'Patch status',
        harmonySettingsTitle: 'Harmony',
        harmonySettingsDescription: 'Manage Harmony Patch loading and runtime options in one place.',
        harmonySettingsExpand: 'Expand Harmony settings',
        harmonySettingsCollapse: 'Collapse Harmony settings',
        workerThreadsTitle: 'Multithreaded loading',
        workerThreadsDescription: 'Process independent Source Patch file groups in parallel. 1 is compatibility mode; changes take effect on the next Patch load, and more threads use more memory.',
        workerThreadsField: 'Loader threads',
        workerThreadsOption: 'threads',
        workerThreadsSaving: 'Saving thread setting…',
        workerThreadsError: 'Thread setting could not be saved.',
        patchTitle: 'Runtime patches',
        patchIntro: 'Read-only monitoring for patch bindings, compatibility and transformed source.',
        patchEmpty: 'No Harmony patches are registered. Install or enable a plugin that declares patches to see it here.',
        patchSelect: 'Select a patch to inspect it.',
        noPatchDescription: 'This Patch does not provide a description.',
        viewPatchDetails: 'View details',
        patchTarget: 'Target',
        patchVersion: 'Version range',
        patchMatches: 'Matches',
        patchGeneration: 'Generation',
        patchOperation: 'Operation',
        patchProvider: 'Plugin',
        patchDeclaration: 'Declaration',
        patchChain: 'Transform chain',
        patchOriginal: 'Original source',
        patchIntermediate: 'Intermediate result',
        patchFinal: 'Final source',
        patchNoChanges: 'This step produced no source changes.',
        patchDiffLimited: 'This change is too large to diff safely. Original and final source remain available.',
        diffAdded: 'Added line',
        diffRemoved: 'Removed line',
        patchPending: 'Waiting for target',
        patchBound: 'Enabled',
        patchHealthy: 'Healthy',
        patchWarning: 'Warning',
        patchDisabled: 'Disabled',
        patchFailed: 'Failed',
        patchKindSource: 'Source patch',
        patchKindSemantic: 'Semantic patch',
        patchKindLoader: 'Loader patch',
        patchKindComposite: 'Composite patch',
        patchOperationBefore: 'Before',
        patchOperationAfter: 'After',
        patchOperationAround: 'Around',
        patchOperationReplace: 'Replace',
        enablePatch: 'Enable this Patch',
        disablePatch: 'Disable this Patch',
        enablePluginPatches: "Enable this plugin's Patches",
        disablePluginPatches: "Disable this plugin's Patches",
        author: 'Author',
        contributors: 'Contributors',
        homepage: 'Homepage',
        bugs: 'Issues',
        license: 'License',
        patchCount: 'Patches',
        patchCountOne: 'Patch',
        showPatch: 'Show Patch card',
        title: 'Patch application order',
        intro: 'Drag a plugin cover to move its stack, or expand it to place an individual Patch.',
        expandStack: 'Expand patch stack',
        collapseStack: 'Collapse patch stack',
        dropAt: 'Drop at position',
        orderEmpty: 'There are no Harmony patches to order.',
        preview: 'Plugin preview placeholder',
        noDescription: 'This plugin does not provide a description.',
        before: 'Must load before',
        after: 'Must load after',
        requires: 'Requires plugins',
        conflicts: 'Conflicts with plugins',
        integrates: 'Integrates with plugins',
        compatibilityWarning: 'Compatibility issues detected; Harmony will not change plugin state:',
        requirementMissing: 'missing',
        requirementInactive: 'inactive',
        requirementVersion: 'version mismatch',
        keyboard: 'Hold a card to recall its plugin Patches · Drag a cover or one Patch · Wheel scrolling stays available',
        movedTo: 'moved to position',
        positionOf: 'of',
        positionUnit: '',
        save: 'Save',
        undo: 'Undo',
        saving: 'Saving…',
        loading: 'Reading Patch order…',
        loadError: 'Patch order could not be loaded.',
        retry: 'Retry',
        confirmTitle: 'Save Patch order?',
        confirmBody: 'Save and hot-reload the new Patch order before leaving Settings, or discard these changes.',
        saveExit: 'Save and exit',
        discard: 'Discard',
        cancel: 'Cancel',
        runtimeTitle: 'Harmony launcher required',
        runtimeBody: 'The plugin is present in this profile, but Harmony is not active in this dsh process. Patches take effect only after the launcher is installed and dsh restarts.',
        runtimeDesktopTitle: 'Desktop is not running through Harmony',
        runtimeDesktopBody: 'Configure the Desktop Host entry, or upgrade to a Desktop version that supports a custom Host entry. Installing the global launcher does not change the Host bundled with Desktop.',
        runtimeInstalled: 'The launcher is installed. Harmony will activate the next time dsh starts.',
        runtimeWorking: 'Working…',
        runtimeError: 'The operation failed',
        sessionPatchMissing: 'Missing now',
        sessionPatchAdded: 'Added now',
        sessionPatchChanged: 'Implementation changed',
        sessionPatchReordered: 'Application order changed',
        sessionPatchReorderedBody: 'The Patch set is unchanged, but its application order differs from the recorded state.',
        instancePatchTitle: 'Instance data used a different Patch profile',
        instancePatchBody: 'This DSH_HOME was last started with another ordered Patch profile. The current instance continued startup and recorded its new state; verify that the changes below are intentional.',
        instancePatchProfiles: 'Profiles',
        instancePatchDismiss: 'Acknowledge',
        reloadStarting: 'Harmony is reloading',
        reloadSucceeded: 'Harmony reloaded successfully',
        reloadFailed: 'Harmony reload failed',
        install: 'Install',
        installRestart: 'Install and restart',
        removePlugin: 'Remove plugin',
        ignoreOnce: 'Ignore once',
        done: 'Done',
      },
    } as const

    type TranslationKey = keyof typeof dictionaries.en
    type Translate = (key: TranslationKey) => string
    type RuntimeAction = 'install' | 'install-restart' | 'remove' | 'ignore'
    type RuntimeState = 'active' | 'missing' | 'desktop-inactive' | 'working' | 'installed' | 'removed' | 'ignored' | 'error'
    type ReloadState = 'idle' | 'reloading' | 'succeeded' | 'failed'

    interface RuntimeStatus {
      state: RuntimeState
      bootId: number
      error?: string
      reload?: { sequence: number; state: ReloadState; error?: string }
    }

    interface ReloadNotice {
      signature: string
      state: ReloadState
      text: string
    }

    interface SessionPatchProfile {
      recordedAt: number
      patches: Array<{ key: string; providerVersion: string; fingerprint: string }>
    }

    interface InstancePatchMismatch {
      state: 'mismatch'
      recorded: SessionPatchProfile & { profile: string }
      current: SessionPatchProfile & { profile: string }
      difference: { missing: string[]; added: string[]; changed: string[]; reordered: boolean }
    }

    type PatchDifferenceKind = 'profile' | 'missing' | 'added' | 'changed' | 'reordered'
    interface PatchDifferenceGroup {
      kind: PatchDifferenceKind
      label: string
      values: string[]
    }

    interface PatchStatus {
      key: string
      id: string
      description?: string
      owner: string
      index: number
      targets: Array<{ package: string; version?: string; file: string }>
      kind: 'source' | 'semantic' | 'loader' | 'composite'
      operation?: 'before' | 'after' | 'around' | 'replace'
      loader?: 'typescript'
      state: 'pending' | 'bound' | 'disabled' | 'failed'
      matches: number
      generation: number
      declaration: string
      warnings?: string[]
      error?: string
      members?: Array<{ id: string; description?: string; kind: 'source' | 'semantic' | 'loader' }>
    }

    const patchKindLabel = (t: Translate, kind: PatchStatus['kind']) => t({
      source: 'patchKindSource',
      semantic: 'patchKindSemantic',
      loader: 'patchKindLoader',
      composite: 'patchKindComposite',
    }[kind] as TranslationKey)
    const patchOperationLabel = (t: Translate, operation: NonNullable<PatchStatus['operation']>) => t({
      before: 'patchOperationBefore',
      after: 'patchOperationAfter',
      around: 'patchOperationAround',
      replace: 'patchOperationReplace',
    }[operation] as TranslationKey)
    const patchTypeLabel = (t: Translate, patch: PatchStatus) => `${patchKindLabel(t, patch.kind)}${
      patch.operation ? ` / ${patchOperationLabel(t, patch.operation)}` : patch.loader ? ` / ${patch.loader}` : ''
    }`

    interface PatchInspection {
      original: string
      final: string
      steps: Array<{ key: string; matches: number; source: string }>
    }

    type SourceDiffEdit = { kind: 'unchanged' | 'added' | 'removed'; text: string }
    type SourceDiffRow = SourceDiffEdit & { oldLine?: number; newLine?: number } | { kind: 'gap' }

    const sourceLines = (source: string) => {
      if (source === '') return []
      const lines = source.replaceAll('\r\n', '\n').replaceAll('\r', '\n').split('\n')
      if (lines.at(-1) === '') lines.pop()
      return lines
    }

    const sourceDiffEdits = (before: string, after: string): SourceDiffEdit[] | undefined => {
      const left = sourceLines(before)
      const right = sourceLines(after)
      const frontier = new Map<number, number>([[1, 0]])
      const trace: Array<Map<number, number>> = []
      const maximum = Math.min(left.length + right.length, 200)
      const deadline = Date.now() + 40
      let distance = 0
      let complete = false

      search: for (; distance <= maximum; distance += 1) {
        if (Date.now() > deadline) break
        trace.push(new Map(frontier))
        for (let diagonal = -distance; diagonal <= distance; diagonal += 2) {
          const previousLeft = frontier.get(diagonal - 1) ?? Number.NEGATIVE_INFINITY
          const previousRight = frontier.get(diagonal + 1) ?? Number.NEGATIVE_INFINITY
          let x = diagonal === -distance || diagonal !== distance && previousLeft < previousRight
            ? previousRight
            : previousLeft + 1
          if (!Number.isFinite(x)) x = 0
          let y = x - diagonal
          while (x < left.length && y < right.length && left[x] === right[y]) {
            x += 1
            y += 1
          }
          frontier.set(diagonal, x)
          if (x >= left.length && y >= right.length) {
            complete = true
            break search
          }
        }
      }
      if (!complete) return undefined

      let x = left.length
      let y = right.length
      const edits: SourceDiffEdit[] = []
      for (let current = distance; current >= 0; current -= 1) {
        const frontierAtDistance = trace[current]!
        const diagonal = x - y
        const previousLeft = frontierAtDistance.get(diagonal - 1) ?? Number.NEGATIVE_INFINITY
        const previousRight = frontierAtDistance.get(diagonal + 1) ?? Number.NEGATIVE_INFINITY
        const previousDiagonal = diagonal === -current || diagonal !== current && previousLeft < previousRight
          ? diagonal + 1
          : diagonal - 1
        const previousX = frontierAtDistance.get(previousDiagonal) ?? 0
        const previousY = previousX - previousDiagonal
        while (x > previousX && y > previousY) {
          edits.push({ kind: 'unchanged', text: left[x - 1]! })
          x -= 1
          y -= 1
        }
        if (current === 0) break
        if (x === previousX) {
          edits.push({ kind: 'added', text: right[y - 1]! })
          y -= 1
        } else {
          edits.push({ kind: 'removed', text: left[x - 1]! })
          x -= 1
        }
      }
      return edits.reverse()
    }

    const sourceDiff = (before: string, after: string): SourceDiffRow[] | undefined => {
      let oldLine = 1
      let newLine = 1
      const edits = sourceDiffEdits(before, after)
      if (edits === undefined) return undefined
      const rows = edits.map((edit): SourceDiffRow => {
        const row = {
          ...edit,
          ...(edit.kind === 'added' ? {} : { oldLine }),
          ...(edit.kind === 'removed' ? {} : { newLine }),
        }
        if (edit.kind !== 'added') oldLine += 1
        if (edit.kind !== 'removed') newLine += 1
        return row
      })
      if (rows.every(row => row.kind === 'unchanged')) return []
      const visible = new Set<number>()
      rows.forEach((row, index) => {
        if (row.kind === 'unchanged') return
        for (let context = Math.max(0, index - 3); context <= Math.min(rows.length - 1, index + 3); context += 1) {
          visible.add(context)
        }
      })
      const compact: SourceDiffRow[] = []
      rows.forEach((row, index) => {
        if (visible.has(index)) compact.push(row)
        else if (compact.at(-1)?.kind !== 'gap') compact.push({ kind: 'gap' })
      })
      return compact
    }

    const sourceLanguage = (file: string): string => {
      const extension = file.split('.').at(-1)?.toLowerCase()
      if (extension === 'js' || extension === 'jsx' || extension === 'mjs' || extension === 'cjs') return 'JavaScript'
      if (extension === 'ts' || extension === 'tsx' || extension === 'mts' || extension === 'cts') return 'TypeScript'
      return extension?.toUpperCase() || 'Source'
    }

    interface HighlightToken {
      content: string
      color: string
      style?: {
        italic?: true
        bold?: true
        underline?: true
        strikethrough?: true
      }
    }

    interface SyntaxHighlighterService {
      highlight(request: { code: string; language?: string }): {
        lines: HighlightToken[][]
      }
    }

    const highlightLanguage = (file: string): string | undefined => {
      const extension = file.split('.').at(-1)?.toLowerCase()
      if (extension === 'mjs' || extension === 'cjs') return 'js'
      if (extension === 'mts' || extension === 'cts') return 'ts'
      return extension
    }

    const renderTokens = (tokens: HighlightToken[]) => tokens.map((token, index) => {
      const decorations = [
        token.style?.underline ? 'underline' : '',
        token.style?.strikethrough ? 'line-through' : '',
      ].filter(Boolean).join(' ')
      return h('span', {
        key: index,
        style: {
          color: token.color,
          fontStyle: token.style?.italic ? 'italic' : undefined,
          fontWeight: token.style?.bold ? 'bold' : undefined,
          textDecoration: decorations || undefined,
        },
      }, token.content)
    })

    const renderHighlightedSource = (lines: HighlightToken[][]) => lines.map((line, index) => h(React.Fragment, { key: index },
      renderTokens(line),
      index < lines.length - 1 ? '\n' : null))

    function HorizontalSource({ as, className, children }: {
      as: 'pre' | 'div'
      className: string
      children: unknown
    }) {
      const viewport = useRef<HTMLElement | null>(null)
      const rail = useRef<HTMLDivElement | null>(null)

      useLayoutEffect(() => {
        const content = viewport.current
        const scrollbar = rail.current
        const spacer = scrollbar?.firstElementChild as HTMLElement | null
        const thumb = scrollbar?.querySelector('.dshHarmonyHorizontalThumb') as HTMLElement | null
        if (content === null || scrollbar === null || spacer === null || thumb === null) return

        const paintThumb = () => {
          const maximum = content.scrollWidth - content.clientWidth
          const width = maximum <= 0
            ? scrollbar.clientWidth
            : Math.max(32, scrollbar.clientWidth * content.clientWidth / content.scrollWidth)
          const left = maximum <= 0 ? 0 : content.scrollLeft / maximum * (scrollbar.clientWidth - width)
          thumb.style.width = `${width}px`
          thumb.style.transform = `translateX(${scrollbar.scrollLeft + left}px)`
        }
        const measure = () => {
          spacer.style.width = `${content.scrollWidth}px`
          scrollbar.hidden = false
          paintThumb()
        }
        const fromContent = () => {
          if (scrollbar.scrollLeft !== content.scrollLeft) scrollbar.scrollLeft = content.scrollLeft
          paintThumb()
        }
        const fromScrollbar = () => {
          if (content.scrollLeft !== scrollbar.scrollLeft) content.scrollLeft = scrollbar.scrollLeft
          paintThumb()
        }
        let drag: { pointerId: number; x: number; scrollLeft: number } | null = null
        const pointerDown = (event: PointerEvent) => {
          const maximum = content.scrollWidth - content.clientWidth
          if (event.button !== 0 || maximum <= 0) return
          const railBounds = scrollbar.getBoundingClientRect()
          const thumbBounds = thumb.getBoundingClientRect()
          if (event.clientX < thumbBounds.left || event.clientX > thumbBounds.right) {
            const travel = scrollbar.clientWidth - thumbBounds.width
            content.scrollLeft = Math.max(0, Math.min(maximum,
              (event.clientX - railBounds.left - thumbBounds.width / 2) / travel * maximum))
            scrollbar.scrollLeft = content.scrollLeft
            paintThumb()
          }
          drag = { pointerId: event.pointerId, x: event.clientX, scrollLeft: content.scrollLeft }
          scrollbar.setPointerCapture(event.pointerId)
          event.preventDefault()
        }
        const pointerMove = (event: PointerEvent) => {
          if (drag?.pointerId !== event.pointerId) return
          const maximum = content.scrollWidth - content.clientWidth
          const travel = scrollbar.clientWidth - thumb.getBoundingClientRect().width
          if (maximum <= 0 || travel <= 0) return
          content.scrollLeft = Math.max(0, Math.min(maximum,
            drag.scrollLeft + (event.clientX - drag.x) / travel * maximum))
          scrollbar.scrollLeft = content.scrollLeft
          paintThumb()
        }
        const pointerUp = (event: PointerEvent) => {
          if (drag?.pointerId !== event.pointerId) return
          drag = null
          if (scrollbar.hasPointerCapture(event.pointerId)) scrollbar.releasePointerCapture(event.pointerId)
        }
        const observer = new ResizeObserver(measure)
        observer.observe(content)
        content.addEventListener('scroll', fromContent, { passive: true })
        scrollbar.addEventListener('scroll', fromScrollbar, { passive: true })
        scrollbar.addEventListener('pointerdown', pointerDown)
        scrollbar.addEventListener('pointermove', pointerMove)
        scrollbar.addEventListener('pointerup', pointerUp)
        scrollbar.addEventListener('pointercancel', pointerUp)
        measure()
        return () => {
          observer.disconnect()
          content.removeEventListener('scroll', fromContent)
          scrollbar.removeEventListener('scroll', fromScrollbar)
          scrollbar.removeEventListener('pointerdown', pointerDown)
          scrollbar.removeEventListener('pointermove', pointerMove)
          scrollbar.removeEventListener('pointerup', pointerUp)
          scrollbar.removeEventListener('pointercancel', pointerUp)
        }
      })

      return h(React.Fragment, null,
        h(as, { className: `${className} dshHarmonyHorizontalViewport`, ref: viewport, tabIndex: 0 }, children),
        h('div', { className: 'dshHarmonyHorizontalRail', ref: rail, 'aria-hidden': 'true' },
          h('span', { className: 'dshHarmonyHorizontalSpacer' }),
          h('span', { className: 'dshHarmonyHorizontalThumb' })))
    }

    function SourceSection({ label, meta, metaTitle, defaultOpen = false, children }: {
      label: string
      meta?: string
      metaTitle?: string
      defaultOpen?: boolean
      children: unknown
    }) {
      const [open, setOpen] = useState(defaultOpen)
      return h('section', {
        className: 'dshHarmonySourceSection',
        'data-open': open ? 'true' : undefined,
      },
      h('button', {
        className: 'dshHarmonySourceSummary',
        type: 'button',
        'aria-expanded': open,
        onClick: () => setOpen(value => !value),
      },
      h('span', { className: 'dshHarmonySourceTitle' }, label),
      meta === undefined ? null : h('span', {
        className: 'dshHarmonySourceMeta',
        title: metaTitle,
      }, meta)),
      open ? children : null)
    }

    interface PluginView {
      name: string
      version: string
      description: string
      harmony: boolean
      patchCount: number
      before: string[]
      after: string[]
      compatibility: {
        requires: Record<string, string>
        conflicts: Record<string, string>
        integrates: Record<string, string>
      }
      author: string
      contributors: string[]
      homepage: string
      bugs: string
      license: string
    }

    interface ProfileView {
      revision: number
      workerThreads: number
      order: string[]
      patchOrder: string[]
      disabled: string[]
      plugins: PluginView[]
      orderViolations: Array<{ before: string; after: string; declaredBy: string }>
      patchOrderViolations: Array<{ before: string; after: string; declaredBy: string }>
      compatibility: Array<
        | {
            kind: 'conflict'
            left: { package: string; version: string; entryIds: string[] }
            right: { package: string; version: string; entryIds: string[] }
            declaredBy: string[]
          }
        | {
            kind: 'requirement'
            owner: { package: string; version: string; entryIds: string[] }
            target: { package: string; range: string; version: string | null; entryIds: string[] }
            reason: 'missing' | 'inactive' | 'version'
          }
        | {
            kind: 'integration'
            owner: { package: string; version: string; entryIds: string[] }
            target: { package: string; version: string; entryIds: string[] }
            range: string
          }
      >
    }

    interface PatchRun {
      owner: string
      keys: string[]
      start: number
      end: number
    }

    interface PatchStackNode {
      type: 'stack'
      id: string
      owner: string
      keys: string[]
      start: number
      end: number
      expanded: boolean
    }
    type PatchViewNode = PatchStackNode | { type: 'placeholder'; index: number }
    type PatchCardStatus = 'normal' | 'warning' | 'error' | 'disabled'
    type OrderSelection = { kind: 'plugin'; key: string } | { kind: 'patch'; key: string }

    let patchStyleOwners: string[] = []
    let patchStyleReorderQueued = false

    const effectiveStyleOwners = (profile: ProfileView): string[] => {
      const disabled = new Set(profile.disabled)
      const lastPatch = new Map<string, number>()
      const providerNames = profile.plugins.filter(plugin => plugin.harmony)
        .map(plugin => plugin.name).sort((left, right) => right.length - left.length)
      profile.patchOrder.forEach((key, index) => {
        const owner = providerNames.find(name => key.startsWith(`${name}/`))
        if (owner === undefined) return
        if (disabled.has(key) || disabled.has(`${owner}/*`)) return
        lastPatch.set(owner, index)
      })
      return [...lastPatch.keys()].sort((left, right) => lastPatch.get(left)! - lastPatch.get(right)!)
    }

    const reorderPatchStyles = () => {
      patchStyleReorderQueued = false
      if (patchStyleOwners.length === 0) return
      const rank = new Map(patchStyleOwners.map((owner, index) => [owner, index]))
      const styles = [...document.head.querySelectorAll<HTMLStyleElement>('style[data-plugin]')]
      const ranked = styles.filter(style => rank.has(style.dataset.plugin ?? ''))
      const desired = [...ranked].sort((left, right) =>
        rank.get(left.dataset.plugin ?? '')! - rank.get(right.dataset.plugin ?? '')!)
      if (desired.length === 0) return
      if (ranked.every((style, index) => style === desired[index])) return
      const slots = ranked.map(style => {
        const marker = document.createComment('dsh-harmony-style-order')
        style.before(marker)
        return marker
      })
      slots.forEach((marker, index) => marker.replaceWith(desired[index]!))
    }

    const schedulePatchStyleReorder = () => {
      if (patchStyleReorderQueued) return
      patchStyleReorderQueued = true
      queueMicrotask(reorderPatchStyles)
    }

    const applyPatchStyleOrder = (profile: ProfileView) => {
      patchStyleOwners = effectiveStyleOwners(profile)
      schedulePatchStyleReorder()
    }

    const refreshPatchStyleOrder = async () => {
      const response = await fetch('/dsh-harmony/profile', { cache: 'no-store' })
      if (response.ok) applyPatchStyleOrder(await response.json() as ProfileView)
    }

    interface PatchDragProjection {
      keys: string[]
      target: number
      visible: boolean
    }

    interface PatchDragPreview {
      keys: string[]
      owner: string
      kind: 'patch' | 'stack'
      x: number
      y: number
      width: number
      height: number
      offsetX: number
      offsetY: number
    }

    interface ActivePatchDrag extends PatchDragPreview {
      pointerId: number
      originX: number
      originY: number
      lastX: number
      lastY: number
      moved: boolean
      recalled: boolean
      target: number
      markerVisible: boolean
    }

    interface HarmonyClientContext {
      effect(register: () => unknown, label?: string): void
      get(name: string): unknown
      locale: {
        register(namespace: string, values: typeof dictionaries): unknown
        bind(namespace: string): Translate
      }
      slots: {
        inject(name: string, mount: () => unknown): unknown
        register(options: Record<string, unknown>, component: unknown): unknown
      }
    }

    const localeNamespace = 'dsh-harmony'
    const sameOrder = (left: string[], right: string[]) => left.length === right.length && left.every((name, index) => name === right[index])
    const sameItems = (left: string[], right: string[]) => left.length === right.length && left.every(item => right.includes(item))
    const harmonyPlugin = 'dsh-harmony'
    const displayName = (name: string) => name.replace(/^@[^/]+\//, '')
    const listName = (name: string) => name === harmonyPlugin ? 'Harmony' : displayName(name)
    const packageScope = (name: string) => name.match(/^(@[^/]+)\//)?.[1] ?? ''
    const detailAuthor = (plugin: PluginView) => [packageScope(plugin.name), plugin.author].filter(Boolean).join(' · ')
    const patchTargetLabel = (patch: PatchStatus | undefined) => patch?.targets
      .map(target => `${target.package}/${target.file}`)
      .join(', ') ?? ''
    const stackId = (owner: string, keys: string[]) => `${owner}:${keys.join('|')}`
    const stackBoundary = (left: string, right: string) => `${left}\0${right}`
    const stackMinGap = 2
    const stackLogGapScale = 12
    const stackBottomInset = 12
    const dragStartDistance = 8
    const longPressDelay = 620
    const stackStatusWeight: Record<PatchCardStatus, number> = { normal: 1, disabled: 0.5, warning: 1.5, error: 1.5 }
    const stackGeometry = (statuses: PatchCardStatus[]) => {
      const base = Math.log(Math.max(1, statuses.length)) * stackLogGapScale / Math.max(1, statuses.length)
      const gaps = statuses.map(status => Math.max(base * stackStatusWeight[status], stackMinGap))
      const positions = [0]
      for (const gap of gaps) positions.push(positions.at(-1)! + gap)
      return { gaps, positions, height: positions.at(-1)! }
    }
    const stackLayer = (statuses: PatchCardStatus[], depth: number) => {
      const { positions, height } = stackGeometry(statuses)
      const bottom = positions[depth + 1]!
      const inset = bottom / height * stackBottomInset
      return { bottom, left: inset, right: inset }
    }
    const patchOwner = (key: string, patches: ReadonlyMap<string, PatchStatus>) => patches.get(key)?.owner ?? key.slice(0, Math.max(0, key.lastIndexOf('/')))
    const insertPatches = (order: string[], keys: string[], target: number): string[] => {
      const moving = new Set(keys)
      const remaining = order.filter(item => !moving.has(item))
      remaining.splice(Math.max(0, Math.min(target, remaining.length)), 0, ...keys)
      return remaining
    }
    const reconcilePatchView = (
      order: string[],
      patches: ReadonlyMap<string, PatchStatus>,
      expandedKeys: ReadonlySet<string>,
      stackBreaks: ReadonlySet<string>,
      dragProjection: PatchDragProjection | null,
    ): PatchViewNode[] => {
      const entries: Array<string | null> = dragProjection === null
        ? [...order]
        : (() => {
            const moving = new Set(dragProjection.keys)
            const remaining: Array<string | null> = order.filter(key => !moving.has(key))
            if (dragProjection.visible) remaining.splice(Math.max(0, Math.min(dragProjection.target, remaining.length)), 0, null)
            return remaining
          })()
      const nodes: PatchViewNode[] = []
      let run: PatchRun | null = null
      const flush = () => {
        if (run === null) return
        nodes.push({
          type: 'stack',
          id: stackId(run.owner, run.keys),
          owner: run.owner,
          keys: run.keys,
          start: run.start,
          end: run.end,
          expanded: run.keys.some(key => expandedKeys.has(key)),
        })
        run = null
      }
      let patchIndex = 0
      for (const entry of entries) {
        if (entry === null) {
          flush()
          nodes.push({ type: 'placeholder', index: patchIndex })
          continue
        }
        const owner = patchOwner(entry, patches)
        const currentRun = run as PatchRun | null
        const previous = currentRun?.keys.at(-1)
        if (currentRun !== null && currentRun.owner === owner && previous !== undefined && !stackBreaks.has(stackBoundary(previous, entry))) {
          currentRun.keys.push(entry)
          currentRun.end = patchIndex + 1
        } else {
          flush()
          run = { owner, keys: [entry], start: patchIndex, end: patchIndex + 1 }
        }
        patchIndex += 1
      }
      flush()
      return nodes
    }

    const modalFocusable = 'button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'
    function useModalFocus(
      active: boolean,
      layer: { current: HTMLElement | null },
      dialog: { current: HTMLElement | null },
      initial: { current: HTMLElement | null },
      onEscape: () => void,
    ) {
      const escape = useRef(onEscape)
      escape.current = onEscape
      useEffect(() => {
        if (!active || layer.current === null || dialog.current === null) return
        const overlay = layer.current
        const modal = dialog.current
        const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
        const siblings = overlay.parentElement === null
          ? []
          : [...overlay.parentElement.children].filter((element): element is HTMLElement => element instanceof HTMLElement && element !== overlay)
        const previousInert = siblings.map(element => [element, element.hasAttribute('inert')] as const)
        for (const element of siblings) element.setAttribute('inert', '')
        const focusable = () => [...modal.querySelectorAll<HTMLElement>(modalFocusable)]
        ;(initial.current ?? focusable()[0] ?? modal).focus()
        const keydown = (event: KeyboardEvent) => {
          if (event.key === 'Escape') {
            event.preventDefault()
            event.stopImmediatePropagation()
            escape.current()
            return
          }
          if (event.key !== 'Tab') return
          const items = focusable()
          if (items.length === 0) {
            event.preventDefault()
            modal.focus()
            return
          }
          const first = items[0]!
          const last = items.at(-1)!
          if (event.shiftKey && (document.activeElement === first || !modal.contains(document.activeElement))) {
            event.preventDefault()
            last.focus()
          } else if (!event.shiftKey && (document.activeElement === last || !modal.contains(document.activeElement))) {
            event.preventDefault()
            first.focus()
          }
        }
        document.addEventListener('keydown', keydown, true)
        return () => {
          document.removeEventListener('keydown', keydown, true)
          for (const [element, inert] of previousInert) {
            if (!inert) element.removeAttribute('inert')
          }
          if (previousFocus?.isConnected) previousFocus.focus()
        }
      }, [active])
    }

    function RuntimePrompt({ t }: { t: Translate }) {
      const [status, setStatus] = useState<RuntimeStatus | null>(null)
      const [busy, setBusy] = useState(false)
      const [dismissed, setDismissed] = useState(false)
      const layer = useRef<HTMLDivElement | null>(null)
      const dialog = useRef<HTMLElement | null>(null)
      const primary = useRef<HTMLButtonElement | null>(null)

      useEffect(() => {
        fetch('/dsh-harmony/runtime', { cache: 'no-store' })
          .then(response => response.ok ? response.json() : null)
          .then(setStatus)
          .catch(() => {})
      }, [])
      const choose = async (action: RuntimeAction) => {
        if (status === null) return
        setBusy(true)
        let polling = false
        try {
          const previous = status.bootId
          const response = await fetch('/dsh-harmony/runtime', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ action }),
          })
          if (!response.ok) throw new Error(`${response.status}`)
          const next = await response.json() as RuntimeStatus
          setStatus(next)
          if (action === 'ignore') return setDismissed(true)
          if (action !== 'install-restart' || next.state !== 'installed') return
          polling = true
          const deadline = Date.now() + 15_000
          const poll = async () => {
            try {
              const current = await fetch('/dsh-harmony/runtime', { cache: 'no-store' }).then(result => result.json() as Promise<RuntimeStatus>)
              if (current.bootId !== previous && current.state === 'active') return window.location.reload()
            } catch {}
            if (Date.now() < deadline) return window.setTimeout(poll, 300)
            setStatus({ state: 'error', bootId: previous, error: 'Restart timed out' })
            setBusy(false)
          }
          window.setTimeout(poll, 300)
        } catch (reason) {
          setStatus({ state: status.state === 'desktop-inactive' ? 'desktop-inactive' : 'error', bootId: status.bootId, error: reason instanceof Error ? reason.message : String(reason) })
        } finally {
          if (!polling) setBusy(false)
        }
      }

      const visible = !dismissed && status !== null && status.state !== 'active' && status.state !== 'ignored' && status.state !== 'removed'
      useModalFocus(visible, layer, dialog, primary, () => {
        if (busy || status === null) return
        if (status.state === 'installed') setDismissed(true)
        else void choose('ignore')
      })
      useEffect(() => { if (visible) primary.current?.focus() }, [status?.state])

      if (!visible || status === null) return null
      const installed = status.state === 'installed'
      const desktopInactive = status.state === 'desktop-inactive'
      return h('div', { className: 'dshHarmonyRuntimeLayer', role: 'presentation', ref: layer },
        h('section', { className: 'dshHarmonyRuntimeDialog', role: 'alertdialog', 'aria-modal': 'true', 'aria-labelledby': 'dsh-harmony-runtime-title', ref: dialog, tabIndex: -1 },
          h('h2', { id: 'dsh-harmony-runtime-title' }, t(desktopInactive ? 'runtimeDesktopTitle' : 'runtimeTitle')),
          h('p', null, t(desktopInactive ? 'runtimeDesktopBody' : installed ? 'runtimeInstalled' : status.state === 'working' ? 'runtimeWorking' : 'runtimeBody')),
          status.error ? h('p', { className: 'dshHarmonyRuntimeError', role: 'alert' }, `${t('runtimeError')}: ${status.error}`) : null,
          h('div', { className: 'dshHarmonyRuntimeActions' },
            installed
              ? h('button', { ref: primary, className: 'dshHarmonySecondary', type: 'button', onClick: () => setDismissed(true) }, t('done'))
              : desktopInactive
                ? h(React.Fragment, null,
                  h('button', { className: 'dshHarmonySecondary dshHarmonyDanger', type: 'button', disabled: busy, onClick: () => { void choose('remove') } }, t('removePlugin')),
                  h('button', { ref: primary, className: 'dshHarmonyButton', type: 'button', disabled: busy, onClick: () => { void choose('ignore') } }, busy ? t('runtimeWorking') : t('ignoreOnce')))
              : h(React.Fragment, null,
                h('button', { className: 'dshHarmonySecondary dshHarmonyDanger', type: 'button', disabled: busy, onClick: () => { void choose('remove') } }, t('removePlugin')),
                h('button', { className: 'dshHarmonySecondary', type: 'button', disabled: busy, onClick: () => { void choose('ignore') } }, t('ignoreOnce')),
                h('button', { className: 'dshHarmonySecondary', type: 'button', disabled: busy, onClick: () => { void choose('install') } }, t('install')),
                h('button', { ref: primary, className: 'dshHarmonyButton', type: 'button', disabled: busy, onClick: () => { void choose('install-restart') } }, busy ? t('runtimeWorking') : t('installRestart'))))))
    }

    function PatchDifferenceCards({ groups, idPrefix, t }: { groups: PatchDifferenceGroup[]; idPrefix: string; t: Translate }) {
      const patchIdentity = (key: string) => {
        const separator = key.lastIndexOf('/')
        return separator < 0
          ? { name: key, owner: '' }
          : { name: key.slice(separator + 1), owner: key.slice(0, separator) }
      }
      return h('div', { className: 'dshHarmonySessionDiff' }, groups.map(group => {
        const titleId = `${idPrefix}-${group.kind}`
        return h('section', {
          key: group.kind,
          className: 'dshHarmonySessionDiffCard',
          'data-kind': group.kind,
          'aria-labelledby': titleId,
        },
        h('header', { className: 'dshHarmonySessionDiffHeader' },
          h('span', { className: 'dshHarmonySessionDiffState', 'aria-hidden': 'true' }),
          h('h3', { id: titleId, className: 'dshHarmonySessionDiffTitle' }, group.label),
          group.kind === 'profile' || group.kind === 'reordered'
            ? null
            : h('span', { className: 'dshHarmonySessionDiffCount' }, group.values.length)),
        group.kind === 'profile'
          ? h('div', { className: 'dshHarmonySessionProfile', 'aria-label': `${group.values[0]} → ${group.values[1]}` },
            h('code', { title: group.values[0] }, group.values[0]),
            h('span', { className: 'dshHarmonySessionProfileArrow', 'aria-hidden': 'true' }, '→'),
            h('code', { title: group.values[1] }, group.values[1]))
          : group.kind === 'reordered'
            ? h('p', { className: 'dshHarmonySessionReordered' }, t('sessionPatchReorderedBody'))
            : h('ul', { className: 'dshHarmonySessionPatchList' }, group.values.map(key => {
              const identity = patchIdentity(key)
              return h('li', { key, className: 'dshHarmonySessionPatch', 'aria-label': key, title: key },
                h('span', { className: 'dshHarmonySessionPatchState', 'aria-hidden': 'true' }),
                h('span', { className: 'dshHarmonySessionPatchText' },
                  h('span', { className: 'dshHarmonySessionPatchName' }, identity.name),
                  identity.owner === '' ? null : h('span', { className: 'dshHarmonySessionPatchOwner' }, identity.owner)))
            })))
      }))
    }

    function InstancePatchPrompt({ t }: { t: Translate }) {
      const [check, setCheck] = useState<InstancePatchMismatch | null>(null)
      const layer = useRef<HTMLElement | null>(null)
      const dialog = useRef<HTMLElement | null>(null)
      const primary = useRef<HTMLButtonElement | null>(null)
      useEffect(() => {
        let mounted = true
        void fetch('/dsh-harmony/instance-profile', { cache: 'no-store' })
          .then(response => response.ok ? response.json() as Promise<InstancePatchMismatch | { state: string }> : undefined)
          .then(result => {
            if (mounted && result?.state === 'mismatch') setCheck(result as InstancePatchMismatch)
          })
          .catch(() => {})
        return () => { mounted = false }
      }, [])
      useModalFocus(check !== null, layer, dialog, primary, () => setCheck(null))
      if (check === null) return null
      const difference = check.difference
      const groups: PatchDifferenceGroup[] = [
        check.recorded.profile === check.current.profile
          ? null : { kind: 'profile', label: t('instancePatchProfiles'), values: [check.recorded.profile, check.current.profile] },
        difference.missing.length === 0 ? null : { kind: 'missing', label: t('sessionPatchMissing'), values: difference.missing },
        difference.added.length === 0 ? null : { kind: 'added', label: t('sessionPatchAdded'), values: difference.added },
        difference.changed.length === 0 ? null : { kind: 'changed', label: t('sessionPatchChanged'), values: difference.changed },
        difference.reordered ? { kind: 'reordered', label: t('sessionPatchReordered'), values: [] } : null,
      ].filter((group): group is PatchDifferenceGroup => group !== null)
      return h('div', { className: 'dshHarmonyRuntimeLayer', role: 'presentation', ref: layer },
        h('section', { className: 'dshHarmonyRuntimeDialog dshHarmonyPatchDialog', role: 'alertdialog', 'aria-modal': 'true', 'aria-labelledby': 'dsh-harmony-instance-patch-title', ref: dialog, tabIndex: -1 },
          h('h2', { id: 'dsh-harmony-instance-patch-title' }, t('instancePatchTitle')),
          h('p', null, t('instancePatchBody')),
          h(PatchDifferenceCards, { groups, idPrefix: 'dsh-harmony-instance-diff', t }),
          h('div', { className: 'dshHarmonyRuntimeActions' },
            h('button', { ref: primary, className: 'dshHarmonyButton', type: 'button', onClick: () => setCheck(null) }, t('instancePatchDismiss')))))
    }

    function ReloadNotifications({ t }: { t: Translate }) {
      const [notice, setNotice] = useState<ReloadNotice | null>(null)
      const seen = useRef<string | null>(null)

      useEffect(() => {
        let mounted = true
        let timer: number | undefined
        const poll = async () => {
          try {
            const status = await fetch('/dsh-harmony/runtime', { cache: 'no-store' }).then(response => response.json() as Promise<RuntimeStatus>)
            if (!mounted || status.state !== 'active' || status.reload === undefined) return
            const signature = `${status.reload.sequence}:${status.reload.state}`
            if (seen.current === null) seen.current = signature
            else if (seen.current !== signature) {
              seen.current = signature
              void refreshPatchStyleOrder().catch(() => {})
              const reloadMessages: Partial<Record<ReloadState, TranslationKey>> = {
                reloading: 'reloadStarting',
                succeeded: 'reloadSucceeded',
                failed: 'reloadFailed',
              }
              const key = reloadMessages[status.reload.state]
              if (key !== undefined) setNotice({
                signature,
                state: status.reload.state,
                text: status.reload.state === 'failed' && status.reload.error
                  ? `${t(key)}: ${status.reload.error}`
                  : t(key),
              })
            }
          } catch {}
          if (mounted) timer = window.setTimeout(poll, 250)
        }
        void poll()
        return () => {
          mounted = false
          if (timer !== undefined) window.clearTimeout(timer)
        }
      }, [t])

      useEffect(() => {
        if (notice === null || notice.state === 'reloading') return
        const timer = window.setTimeout(() => setNotice(current => current?.signature === notice.signature ? null : current), 4000)
        return () => window.clearTimeout(timer)
      }, [notice])

      if (notice === null) return null
      return h('div', {
        className: 'dshHarmonyToast',
        'data-state': notice.state,
        role: notice.state === 'failed' ? 'alert' : 'status',
      }, h('span', { className: 'dshHarmonyToastDot', 'aria-hidden': 'true' }), notice.text)
    }

    function PatchStatusPage({ t, selected, onSelect, syntaxHighlighter }: {
      t: Translate
      selected: string | null
      onSelect: (key: string | null) => void
      syntaxHighlighter?: SyntaxHighlighterService
    }) {
      const [patches, setPatches] = useState<PatchStatus[]>([])
      const [inspection, setInspection] = useState<PatchInspection | null>(null)
      const [loading, setLoading] = useState(true)
      const [error, setError] = useState('')
      const selectedRow = useRef<HTMLButtonElement | null>(null)
      const patch = patches.find(item => item.key === selected) ?? patches[0]
      const stateLabel = (state: PatchStatus['state']) => t({ pending: 'patchPending', bound: 'patchBound', disabled: 'patchDisabled', failed: 'patchFailed' }[state] as TranslationKey)
      const displayStateLabel = (patch: PatchStatus) => patch.state === 'bound' && patch.warnings?.length
        ? t('patchWarning') : stateLabel(patch.state)
      const diffSteps = useMemo(() => {
        if (inspection === null) return []
        let previous = inspection.original
        return inspection.steps.map(step => {
          const diff = sourceDiff(previous, step.source)
          previous = step.source
          return { ...step, diff }
        })
      }, [inspection])

      const sourceTarget = patch?.targets.length === 1 ? patch.targets[0] : undefined
      const sourceMeta = sourceTarget === undefined ? undefined : `${sourceLanguage(sourceTarget.file)} · ${sourceTarget.file}`
      const sourceMetaTitle = sourceTarget === undefined ? undefined : `${sourceTarget.package}/${sourceTarget.file}`
      const highlightedSources = useMemo(() => {
        if (inspection === null || sourceTarget === undefined || syntaxHighlighter === undefined) return null
        try {
          const cache = new Map<string, HighlightToken[][]>()
          const highlight = (source: string) => {
            let lines = cache.get(source)
            if (lines === undefined) {
              lines = syntaxHighlighter.highlight({ code: source, language: highlightLanguage(sourceTarget.file) }).lines
              cache.set(source, lines)
            }
            return lines
          }
          return {
            original: highlight(inspection.original),
            steps: inspection.steps.map(step => highlight(step.source)),
            final: highlight(inspection.final),
          }
        } catch {
          return null
        }
      }, [inspection, sourceTarget?.file, syntaxHighlighter])
      const sourceSection = (label: string, source: string, highlighted?: HighlightToken[][]) => h(SourceSection, {
        label, meta: sourceMeta, metaTitle: sourceMetaTitle,
      }, h(HorizontalSource, { as: 'pre', className: 'dshHarmonyPatchCode' },
        highlighted === undefined ? source : renderHighlightedSource(highlighted)))

      const diffSection = (step: typeof diffSteps[number], stepIndex: number) => h(SourceSection, {
        key: step.key,
        label: `${t('patchIntermediate')}: ${step.key} · ${step.matches}`,
        meta: sourceMeta,
        metaTitle: sourceMetaTitle,
        defaultOpen: true,
      },
      step.diff === undefined
        ? h('p', { className: 'dshHarmonyDiffEmpty' }, t('patchDiffLimited'))
        : step.diff.length === 0
        ? h('p', { className: 'dshHarmonyDiffEmpty' }, t('patchNoChanges'))
        : h(HorizontalSource, { as: 'div', className: 'dshHarmonyDiff' }, step.diff.map((row, index) => row.kind === 'gap'
          ? h('div', { className: 'dshHarmonyDiffRow dshHarmonyDiffGap', key: index },
            h('span', { className: 'dshHarmonyDiffLine' }),
            h('span', { className: 'dshHarmonyDiffLine' }),
            h('span', { className: 'dshHarmonyDiffMark' }),
            h('code', { className: 'dshHarmonyDiffCode' }, '…'))
          : h('div', { className: 'dshHarmonyDiffRow', 'data-kind': row.kind, key: index },
            h('span', { className: 'dshHarmonyDiffLine' }, row.oldLine ?? ''),
            h('span', { className: 'dshHarmonyDiffLine' }, row.newLine ?? ''),
            h('span', { className: 'dshHarmonyDiffMark', 'aria-hidden': 'true' }, row.kind === 'added' ? '+' : row.kind === 'removed' ? '−' : ''),
            h('code', { className: 'dshHarmonyDiffCode' },
              row.kind === 'unchanged' ? null : h('span', { className: 'dshHarmonySrOnly' }, `${t(row.kind === 'added' ? 'diffAdded' : 'diffRemoved')}: `),
              (() => {
              if (highlightedSources === null) return row.text || ' '
              const line = row.kind === 'removed'
                ? (stepIndex === 0 ? highlightedSources.original : highlightedSources.steps[stepIndex - 1])?.[(row.oldLine ?? 1) - 1]
                : highlightedSources.steps[stepIndex]?.[(row.newLine ?? 1) - 1]
              return line === undefined || line.length === 0 ? ' ' : renderTokens(line)
            })())))))

      const load = async () => {
        setLoading(true)
        setError('')
        try {
          const response = await fetch('/dsh-harmony/patches', { cache: 'no-store' })
          if (!response.ok) throw new Error(`${response.status}`)
          const next = await response.json() as { patches: PatchStatus[] }
          setPatches(next.patches)
          onSelect(next.patches.some(item => item.key === selected) ? selected : next.patches[0]?.key ?? null)
        } catch (reason) {
          setError(reason instanceof Error ? reason.message : String(reason))
        } finally {
          setLoading(false)
        }
      }

      useEffect(() => { void load() }, [])
      useEffect(() => { if (!loading) selectedRow.current?.focus() }, [loading, patch?.key])
      useEffect(() => {
        if (patch === undefined || patch.targets.length !== 1) return setInspection(null)
        let current = true
        setInspection(null)
        const target = patch.targets[0]!
        const query = new URLSearchParams({ package: target.package, file: target.file })
        fetch(`/dsh-harmony/inspect?${query}`, { cache: 'no-store' })
          .then(response => response.ok ? response.json() : Promise.reject(new Error(`${response.status}`)))
          .then((value: { inspections: PatchInspection[] }) => { if (current) setInspection(value.inspections[0] ?? null) })
          .catch(reason => { if (current) setError(reason instanceof Error ? reason.message : String(reason)) })
        return () => { current = false }
      }, [patch?.key])

      return h('section', { className: 'dshHarmonyPatchPage' },
        h('header', null,
          h('h2', { className: 'dshHarmonyHeading' }, t('patchTitle')),
          h('p', { className: 'dshHarmonyIntro' }, t('patchIntro'))),
        loading ? h('div', { className: 'dshHarmonySkeleton', 'aria-label': t('loading') }, h('div'), h('div')) :
          patches.length === 0 ? h('p', { className: 'dshHarmonyStatus' }, t('patchEmpty')) :
            h('div', { className: 'dshHarmonyPatchWorkspace' },
              h('ul', { className: 'dshHarmonyPatchList', 'aria-label': t('patchTitle') },
                patches.map(item => h('li', { key: item.key },
                  h('button', {
                    className: 'dshHarmonyPatchRow', type: 'button',
                    ref: patch?.key === item.key ? selectedRow : undefined,
                    'aria-current': patch?.key === item.key ? 'true' : undefined,
                    'data-patch-key': item.key,
                    onClick: () => onSelect(item.key),
                  },
                  h('span', {
                    className: 'dshHarmonyPatchState',
                    'data-state': item.state === 'bound' && item.warnings?.length ? 'warning' : item.state,
                    title: displayStateLabel(item),
                  }),
                  h('span', { className: 'dshHarmonyPatchRowText' },
                    h('span', { className: 'dshHarmonyPatchRowTitle' },
                      h('span', { className: 'dshHarmonyPatchKey', title: item.key }, item.id),
                      h('span', { className: 'dshHarmonyPatchRowStatus' }, displayStateLabel(item))),
                    h('span', { className: 'dshHarmonyPatchProvider', title: item.owner }, displayName(item.owner)),
                    h('span', { className: 'dshHarmonyPatchTarget', title: patchTargetLabel(item) }, patchTargetLabel(item))))))),
              patch === undefined ? h('p', { className: 'dshHarmonyStatus' }, t('patchSelect')) :
                h('article', { className: 'dshHarmonyPatchDetail' },
                  h('div', { className: 'dshHarmonyPatchHeader' },
                    h('div', null,
                      h('h3', { className: 'dshHarmonyTitle' }, patch.key),
                      h('p', { className: 'dshHarmonyScope' }, `${stateLabel(patch.state)} · ${patchTypeLabel(t, patch)}`))),
                  h('p', { className: 'dshHarmonyDescription' }, patch.description || t('noPatchDescription')),
                  h('div', { className: 'dshHarmonyFacts' },
                    h('span', null, `${t('patchTarget')}: ${patchTargetLabel(patch)}`),
                    patch.targets.length === 1 && patch.targets[0]!.version
                      ? h('span', null, `${t('patchVersion')}: ${patch.targets[0]!.version}`)
                      : null,
                    h('span', null, `${t('patchMatches')}: ${patch.matches}`),
                    h('span', null, `${t('patchGeneration')}: ${patch.generation}`),
                    patch.operation ? h('span', null, `${t('patchOperation')}: ${patchOperationLabel(t, patch.operation)}`) : null),
                  (patch.warnings ?? []).map(warning => h('p', { className: 'dshHarmonyWarning', role: 'status', key: warning }, warning)),
                  patch.error ? h('p', { className: 'dshHarmonyConstraint dshHarmonyError', role: 'alert' }, patch.error) : null,
                  inspection ? h(React.Fragment, null,
                    h('h4', { className: 'dshHarmonyScope' }, t('patchChain')),
                    h('div', { className: 'dshHarmonyPatchChain' }, inspection.steps.map(step => h('span', { key: step.key }, `${step.key} · ${step.matches}`))),
                    h('div', { className: 'dshHarmonySourceSections' },
                      sourceSection(t('patchOriginal'), inspection.original, highlightedSources?.original),
                      diffSteps.map(diffSection),
                      sourceSection(t('patchFinal'), inspection.final, highlightedSources?.final))) : null)),
        error ? h('p', { className: 'dshHarmonyHint dshHarmonyError', role: 'alert' }, `${t('runtimeError')}: ${error}`) : null)
    }

    function HarmonySettings({ t, syntaxHighlighter }: { t: Translate; syntaxHighlighter?: SyntaxHighlighterService }) {
      const [page, setPage] = useState<'order' | 'patches'>('order')
      const [statusPatch, setStatusPatch] = useState<string | null>(null)
      const [view, setView] = useState<ProfileView | null>(null)
      const [patches, setPatches] = useState<PatchStatus[]>([])
      const [savedPatchOrder, setSavedPatchOrder] = useState<string[]>([])
      const [draftPatchOrder, setDraftPatchOrder] = useState<string[]>([])
      const [savedDisabled, setSavedDisabled] = useState<string[]>([])
      const [draftDisabled, setDraftDisabled] = useState<string[]>([])
      const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set<string>())
      const [stackBreaks, setStackBreaks] = useState<Set<string>>(new Set<string>())
      const [draggingKeys, setDraggingKeys] = useState<string[]>([])
      const [dragProjection, setDragProjection] = useState<PatchDragProjection | null>(null)
      const [dragPreview, setDragPreview] = useState<PatchDragPreview | null>(null)
      const [selected, setSelected] = useState<OrderSelection | null>(null)
      const [loading, setLoading] = useState(true)
      const [error, setError] = useState('')
      const [saving, setSaving] = useState(false)
      const [closePrompt, setClosePrompt] = useState<boolean | null>(null)
      const [announcement, setAnnouncement] = useState('')
      const selectedRef = useRef<OrderSelection | null>(selected)
      const listRef = useRef<HTMLDivElement | null>(null)
      const patchRefs = useRef(new Map<string, HTMLButtonElement>())
      const coverRefs = useRef(new Map<string, HTMLDivElement>())
      const drag = useRef<ActivePatchDrag | null>(null)
      const collapseTimers = useRef(new Map<string, { timer: number; keys: string[] }>())
      const hoverExpand = useRef<{ id: string; timer: number } | null>(null)
      const pendingLayout = useRef<{ positions: Map<string, DOMRect>; duration: number } | null>(null)
      const pendingClose = useRef<{ promise: Promise<boolean>; resolve(allow: boolean): void } | null>(null)
      const promptButton = useRef<HTMLButtonElement | null>(null)
      const finishDragRef = useRef<((event: PointerEvent) => void) | null>(null)
      const longPress = useRef<number | null>(null)
      const suppressCardClick = useRef(false)
      const draftPatchOrderRef = useRef(draftPatchOrder)
      const draftDisabledRef = useRef(draftDisabled)
      const viewNodesRef = useRef<PatchViewNode[]>([])
      const stackBreaksRef = useRef(stackBreaks)
      const dirtyRef = useRef(false)
      const saveRef = useRef<(() => Promise<void>) | null>(null)
      const closeLayer = useRef<HTMLDivElement | null>(null)
      const closeDialog = useRef<HTMLDivElement | null>(null)

      const dirty = !sameOrder(savedPatchOrder, draftPatchOrder) || !sameItems(savedDisabled, draftDisabled)
      draftPatchOrderRef.current = draftPatchOrder
      draftDisabledRef.current = draftDisabled
      stackBreaksRef.current = stackBreaks
      selectedRef.current = selected
      dirtyRef.current = dirty
      const plugins = useMemo(() => new Map((view?.plugins ?? []).map(plugin => [plugin.name, plugin])), [view])
      const patchMap = useMemo(() => new Map(patches.map(patch => [patch.key, patch])), [patches])
      const warningPatchKeys = useMemo(() => new Set([
        ...(view?.patchOrderViolations ?? []).flatMap(violation => [violation.before, violation.after]),
        ...patches.filter(patch => patch.warnings?.length).map(patch => patch.key),
      ]), [view, patches])
      const patchDisabled = (patch: PatchStatus | undefined) => patch !== undefined
        && (draftDisabled.includes(patch.key) || draftDisabled.includes(`${patch.owner}/*`))
      const patchOrderState = (patch: PatchStatus): PatchStatus['state'] => {
        if (patchDisabled(patch)) return 'disabled'
        return patch.state === 'disabled' ? 'bound' : patch.state
      }
      const cardStatus = (key: string): PatchCardStatus => {
        const patch = patchMap.get(key)
        if (patchDisabled(patch)) return 'disabled'
        if (patch?.state === 'failed') return 'error'
        if (warningPatchKeys.has(key)) return 'warning'
        return 'normal'
      }
      const stackStatuses = (keys: string[]) => keys.map(cardStatus)
      const stackHealthColor = (keys: string[]) => {
        const statuses = stackStatuses(keys).filter(status => status !== 'disabled')
        if (statuses.length === 0) return 'var(--dsw-alias-label-tertiary)'
        const warning = statuses.filter(status => status === 'warning').length / statuses.length
        const error = statuses.filter(status => status === 'error').length / statuses.length
        const nonError = 1 - error
        const warningWithinNonError = nonError === 0 ? 0 : warning / nonError
        const whiteOrange = `color-mix(in srgb,#fff ${Math.round((1 - warningWithinNonError) * 100)}%,#f59e0b)`
        return error === 0
          ? whiteOrange
          : `color-mix(in srgb,${whiteOrange} ${Math.round(nonError * 100)}%,var(--dsw-alias-state-error-primary))`
      }
      const stackCoverColor = (keys: string[]) => stackStatuses(keys).every(status => status === 'disabled')
        ? 'color-mix(in srgb,var(--dsw-alias-label-tertiary) 10%,var(--dsw-alias-bg-layer-2))'
        : `color-mix(in srgb,${stackHealthColor(keys)} 10%,var(--dsw-alias-bg-layer-2))`
      const stackHealthTitle = (keys: string[]) => {
        const statuses = stackStatuses(keys)
        if (statuses.every(status => status === 'disabled')) return t('patchDisabled')
        const warnings = statuses.filter(status => status === 'warning').length
        const errors = statuses.filter(status => status === 'error').length
        return warnings + errors === 0
          ? t('patchHealthy')
          : [warnings > 0 ? `${warnings} ${t('patchWarning')}` : '', errors > 0 ? `${errors} ${t('patchFailed')}` : ''].filter(Boolean).join(' · ')
      }
      const viewNodes = useMemo(
        () => reconcilePatchView(draftPatchOrder, patchMap, expandedKeys, stackBreaks, dragProjection),
        [draftPatchOrder, patchMap, expandedKeys, stackBreaks, dragProjection],
      )
      viewNodesRef.current = viewNodes
      useLayoutEffect(() => {
        const pending = pendingLayout.current
        pendingLayout.current = null
        if (pending === null) return
        for (const [token, previous] of pending.positions) {
          const element = token.startsWith('patch:')
            ? patchRefs.current.get(token.slice(6))
            : coverRefs.current.get(token.slice(6))
          if (element === undefined) continue
          const current = element.getBoundingClientRect()
          const x = previous.left - current.left
          const y = previous.top - current.top
          if (Math.abs(x) < 0.5 && Math.abs(y) < 0.5) continue
          element.animate([
            { transform: `translate(${x}px, ${y}px)` },
            { transform: 'translate(0, 0)' },
          ], { duration: pending.duration, easing: 'cubic-bezier(.16,1,.3,1)' })
        }
      }, [viewNodes])
      const selectedPatch = selected?.kind === 'patch' ? patchMap.get(selected.key) : undefined
      const selectedOwner = selectedPatch?.owner ?? (selected?.kind === 'plugin' ? selected.key : undefined)
      const selectedPlugin = selectedPatch === undefined
        ? (selected?.kind === 'plugin' ? plugins.get(selected.key) : undefined)
          ?? plugins.get(viewNodes.find((node): node is PatchStackNode => node.type === 'stack')?.owner ?? '')
        : plugins.get(selectedPatch.owner)
      const selectedAuthor = selectedPlugin === undefined ? '' : detailAuthor(selectedPlugin)
      const orderStateLabel = (state: PatchStatus['state']) => t({ pending: 'patchPending', bound: 'patchBound', disabled: 'patchDisabled', failed: 'patchFailed' }[state] as TranslationKey)
      const patchCountLabel = (count: number) => t(count === 1 ? 'patchCountOne' : 'patchCount')

      const load = async () => {
        setLoading(true)
        setError('')
        try {
          const [profileResponse, patchResponse] = await Promise.all([
            fetch('/dsh-harmony/profile', { cache: 'no-store' }),
            fetch('/dsh-harmony/patches', { cache: 'no-store' }),
          ])
          if (!profileResponse.ok) throw new Error(`${profileResponse.status}`)
          if (!patchResponse.ok) throw new Error(`${patchResponse.status}`)
          const next = await profileResponse.json() as ProfileView
          const patchResult = await patchResponse.json() as { patches: PatchStatus[] }
          setView(next)
          setPatches(patchResult.patches)
          setSavedPatchOrder(next.patchOrder)
          setDraftPatchOrder(next.patchOrder)
          setSavedDisabled(next.disabled)
          setDraftDisabled(next.disabled)
          setExpandedKeys(new Set())
          setStackBreaks(new Set())
          const owners = new Set(patchResult.patches.map(patch => patch.owner))
          setSelected(current => {
            if (current?.kind === 'patch' && patchResult.patches.some(patch => patch.key === current.key)) return current
            if (current?.kind === 'plugin' && owners.has(current.key)) return current
            const owner = patchResult.patches[0]?.owner
            return owner === undefined ? null : { kind: 'plugin', key: owner }
          })
        } catch (reason) {
          setError(reason instanceof Error ? reason.message : String(reason))
        } finally {
          setLoading(false)
        }
      }

      const save = async () => {
        if (view === null) return
        setSaving(true)
        setError('')
        try {
          const patchOrder = draftPatchOrderRef.current
          const disabled = draftDisabledRef.current
          const response = await fetch('/dsh-harmony/profile', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ expectedRevision: view.revision, patchOrder, disabled }),
          })
          const next = await response.json() as ProfileView & { error?: string }
          if (!response.ok) {
            if (response.status === 409) await load()
            throw new Error(next.error ?? `${response.status}`)
          }
          applyPatchStyleOrder(next)
          setView(next)
          setSavedPatchOrder(next.patchOrder)
          setDraftPatchOrder(next.patchOrder)
          setSavedDisabled(next.disabled)
          setDraftDisabled(next.disabled)
          const patchResponse = await fetch('/dsh-harmony/patches', { cache: 'no-store' })
          if (patchResponse.ok) setPatches((await patchResponse.json() as { patches: PatchStatus[] }).patches)
        } catch (reason) {
          setError(reason instanceof Error ? reason.message : String(reason))
          throw reason
        } finally {
          setSaving(false)
        }
      }
      saveRef.current = save

      const toggleDisabled = (key: string) => setDraftDisabled(current => current.includes(key)
        ? current.filter(item => item !== key)
        : [...current, key])

      useEffect(() => { void load() }, [])
      useEffect(() => () => {
        for (const item of collapseTimers.current.values()) window.clearTimeout(item.timer)
        if (hoverExpand.current !== null) window.clearTimeout(hoverExpand.current.timer)
        if (longPress.current !== null) window.clearTimeout(longPress.current)
      }, [])
      useEffect(() => {
        const finish = (event: PointerEvent) => finishDragRef.current?.(event)
        window.addEventListener('pointerup', finish, true)
        window.addEventListener('pointercancel', finish, true)
        return () => {
          window.removeEventListener('pointerup', finish, true)
          window.removeEventListener('pointercancel', finish, true)
        }
      }, [])
      useEffect(() => {
        const guard = () => {
          if (!dirtyRef.current) return Promise.resolve(true)
          if (pendingClose.current !== null) return pendingClose.current.promise
          let resolve!: (allow: boolean) => void
          const promise = new Promise<boolean>(next => { resolve = next })
          pendingClose.current = { promise, resolve }
          setClosePrompt(true)
          return promise
        }
        window.__dshHarmonyBeforeSettingsClose = guard
        const beforeUnload = (event: BeforeUnloadEvent) => {
          if (!dirtyRef.current) return
          event.preventDefault()
          event.returnValue = ''
        }
        window.addEventListener('beforeunload', beforeUnload)
        return () => {
          if (window.__dshHarmonyBeforeSettingsClose === guard) delete window.__dshHarmonyBeforeSettingsClose
          window.removeEventListener('beforeunload', beforeUnload)
        }
      }, [])

      const currentStacks = () => viewNodesRef.current.filter((node): node is PatchStackNode => node.type === 'stack')
      const captureLayout = (duration: number, overrides?: ReadonlyMap<string, DOMRect>) => {
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
        const positions = new Map([
          ...[...patchRefs.current].map(([key, element]) => [`patch:${key}`, element.getBoundingClientRect()] as const),
          ...[...coverRefs.current].map(([id, element]) => [`cover:${id}`, element.getBoundingClientRect()] as const),
        ])
        for (const [key, bounds] of overrides ?? []) positions.set(`patch:${key}`, bounds)
        pendingLayout.current = { positions, duration }
      }
      const setExpandedWithMotion = (update: (current: Set<string>) => Set<string>, duration: number) => {
        captureLayout(duration)
        setExpandedKeys(update)
      }
      const cancelCollapse = (keys: readonly string[]) => {
        for (const [id, item] of collapseTimers.current) {
          if (!item.keys.some(key => keys.includes(key))) continue
          window.clearTimeout(item.timer)
          collapseTimers.current.delete(id)
        }
      }
      const collapseStack = (stack: PatchStackNode) => {
        cancelCollapse(stack.keys)
        setExpandedWithMotion(current => {
          const next = new Set(current)
          for (const key of stack.keys) next.delete(key)
          return next
        }, 320)
      }
      const scheduleCollapse = (owner: string, keys: readonly string[]) => {
        const containsSelectedPatch = () => selectedRef.current?.kind === 'patch' && keys.includes(selectedRef.current.key)
        if (containsSelectedPatch()) return
        const id = stackId(owner, [...keys])
        if (collapseTimers.current.has(id)) return
        const pendingKeys = [...keys]
        const timer = window.setTimeout(() => {
          collapseTimers.current.delete(id)
          if (containsSelectedPatch()) return
          setExpandedWithMotion(current => {
            const next = new Set(current)
            for (const key of pendingKeys) next.delete(key)
            return next
          }, 320)
        }, 520)
        collapseTimers.current.set(id, { timer, keys: pendingKeys })
      }
      const patchBounds = (key: string) => {
        const element = patchRefs.current.get(key)
        return (element?.parentElement ?? element)?.getBoundingClientRect()
      }
      const expandedGroups = () => {
        const groups: Array<{
          owner: string
          expandedKeys: string[]
          nodes: PatchStackNode[]
        }> = []
        let activeOwner: string | null = null
        for (const node of viewNodesRef.current) {
          if (node.type === 'placeholder') continue
          const openKeys = node.keys.filter(key => expandedKeys.has(key))
          if (activeOwner === node.owner) {
            const group = groups.at(-1)!
            group.nodes.push(node)
            group.expandedKeys.push(...openKeys)
          }
          else {
            activeOwner = node.owner
            groups.push({ owner: node.owner, expandedKeys: openKeys, nodes: [node] })
          }
        }
        return groups.filter(group => group.expandedKeys.length > 0)
      }
      const reconcileCollapses = (clientY: number) => {
        for (const group of expandedGroups()) {
          const bounds = group.nodes.map(nodeBounds).filter((value): value is DOMRect => value !== undefined)
          if (bounds.length === 0) continue
          const top = Math.min(...bounds.map(value => value.top))
          const bottom = Math.max(...bounds.map(value => value.bottom))
          if (clientY >= top && clientY <= bottom) cancelCollapse(group.expandedKeys)
          else scheduleCollapse(group.owner, group.expandedKeys)
        }
      }
      const nodeBounds = (node: PatchStackNode): DOMRect | undefined => {
        if (!node.expanded) return coverRefs.current.get(node.id)?.getBoundingClientRect()
        const bounds = node.keys.map(patchBounds).filter((value): value is DOMRect => value !== undefined)
        if (bounds.length === 0) return undefined
        const left = Math.min(...bounds.map(value => value.left))
        const top = Math.min(...bounds.map(value => value.top))
        const right = Math.max(...bounds.map(value => value.right))
        const bottom = Math.max(...bounds.map(value => value.bottom))
        return new DOMRect(
          left,
          top,
          right - left,
          bottom - top,
        )
      }
      const reconcileMerges = (clientY: number) => {
        const remove: string[] = []
        const runs: PatchStackNode[][] = []
        for (const node of viewNodesRef.current) {
          if (node.type === 'placeholder') continue
          const active = runs.at(-1)
          if (active?.[0]?.owner === node.owner) active.push(node)
          else runs.push([node])
        }
        for (const run of runs) {
          if (run.length > 1) {
            const boundaries = run.slice(1).map((right, index) => stackBoundary(run[index]!.keys.at(-1)!, right.keys[0]!))
              .filter(boundary => stackBreaksRef.current.has(boundary))
            const bounds = run.map(nodeBounds).filter((value): value is DOMRect => value !== undefined)
            if (boundaries.length > 0 && bounds.length === run.length) {
              const top = Math.min(...bounds.map(value => value.top))
              const bottom = Math.max(...bounds.map(value => value.bottom))
              if (clientY < top || clientY > bottom) remove.push(...boundaries)
            }
          }
        }
        if (remove.length === 0) return
        captureLayout(320)
        const next = new Set(stackBreaksRef.current)
        for (const boundary of remove) next.delete(boundary)
        stackBreaksRef.current = next
        setStackBreaks(next)
      }
      const expandStack = (stack: PatchStackNode, clientY?: number) => {
        cancelCollapse(stack.keys)
        setExpandedWithMotion(current => new Set([...current, ...stack.keys]), 380)
        if (clientY !== undefined && clientY > 0) {
          window.setTimeout(() => reconcileCollapses(clientY), 0)
        }
      }
      const cancelHoverExpand = () => {
        if (hoverExpand.current === null) return
        window.clearTimeout(hoverExpand.current.timer)
        hoverExpand.current = null
      }
      const updateHoverExpand = (clientX: number, clientY: number, active: ActivePatchDrag) => {
        const moving = new Set(active.keys)
        const target = currentStacks().find(stack => {
          if (stack.expanded || stack.keys.length === 1 || stack.keys.some(key => moving.has(key))) return false
          const element = coverRefs.current.get(stack.id)
          if (element === undefined) return false
          const bounds = element.getBoundingClientRect()
          return clientX >= bounds.left && clientX <= bounds.right && clientY >= bounds.top && clientY <= bounds.bottom
        })
        const id = target?.id ?? ''
        if (hoverExpand.current?.id === id) return
        cancelHoverExpand()
        if (target === undefined) return
        const keys = [...target.keys]
        const timer = window.setTimeout(() => {
          hoverExpand.current = null
          setExpandedWithMotion(current => new Set([...current, ...keys]), 380)
        }, 460)
        hoverExpand.current = { id, timer }
      }
      const applyPatchOrder = (next: string[], overrides?: ReadonlyMap<string, DOMRect>) => {
        const breaks = new Set([...stackBreaksRef.current].filter(boundary => {
          const [left, right] = boundary.split('\0')
          const index = next.indexOf(left!)
          return index >= 0 && next[index + 1] === right
        }))
        captureLayout(320, overrides)
        stackBreaksRef.current = breaks
        setStackBreaks(breaks)
        if (sameOrder(draftPatchOrderRef.current, next)) return
        draftPatchOrderRef.current = next
        setDraftPatchOrder(next)
      }
      const undoDraft = () => {
        if (!dirty || saving) return
        captureLayout(320)
        const next = [...savedPatchOrder]
        const breaks = new Set<string>()
        draftPatchOrderRef.current = next
        draftDisabledRef.current = [...savedDisabled]
        stackBreaksRef.current = breaks
        setDraftDisabled(savedDisabled)
        setExpandedKeys(new Set())
        setStackBreaks(breaks)
        setDraftPatchOrder(next)
      }
      const moveByKeyboard = (key: string, offset: -1 | 1, restoreFocus?: () => void) => {
        if (saving) return
        const index = draftPatchOrderRef.current.indexOf(key)
        if (index < 0) return
        const target = offset < 0 ? Math.max(0, index - 1) : Math.min(draftPatchOrderRef.current.length - 1, index + 1)
        if (target === index) return
        applyPatchOrder(insertPatches(draftPatchOrderRef.current, [key], target))
        setAnnouncement(`${key} ${t('movedTo')} ${target + 1} ${t('positionOf')} ${draftPatchOrderRef.current.length}${t('positionUnit')}`)
        requestAnimationFrame(() => {
          if (restoreFocus === undefined) patchRefs.current.get(key)?.focus()
          else restoreFocus()
        })
      }
      const cancelLongPress = () => {
        if (longPress.current === null) return
        window.clearTimeout(longPress.current)
        longPress.current = null
      }
      const startDragging = (active: ActivePatchDrag) => {
        active.moved = true
        active.x = active.lastX
        active.y = active.lastY
        active.markerVisible = false
        setDraggingKeys(active.keys)
        setDragPreview({ ...active })
        captureLayout(180)
        setDragProjection({ keys: active.keys, target: active.target, visible: false })
      }
      const recallPluginPatches = (active: ActivePatchDrag) => {
        const order = draftPatchOrderRef.current
        const anchor = Math.min(...active.keys.map(key => order.indexOf(key)).filter(index => index >= 0))
        const keys = [...patchMap.values()]
          .filter(patch => patch.owner === active.owner)
          .sort((left, right) => left.index - right.index)
          .map(patch => patch.key)
        if (keys.length === 0 || !Number.isFinite(anchor)) return
        active.recalled = true
        const target = order.slice(0, anchor).filter(key => patchOwner(key, patchMap) !== active.owner).length
        const recalled = new Set(keys)
        const breaks = new Set([...stackBreaksRef.current].filter(boundary => {
          const [left, right] = boundary.split('\0')
          return !recalled.has(left!) || !recalled.has(right!)
        }))
        stackBreaksRef.current = breaks
        setStackBreaks(breaks)
        cancelCollapse(keys)
        setExpandedKeys(current => {
          const next = new Set(current)
          for (const key of keys) next.delete(key)
          return next
        })
        setSelected(active.kind === 'patch'
          ? { kind: 'patch', key: active.keys[0]! }
          : { kind: 'plugin', key: active.owner })
        applyPatchOrder(insertPatches(order, keys, target))
        active.keys = keys
        active.kind = 'stack'
        active.target = target
        startDragging(active)
        updateHoverExpand(active.lastX, active.lastY, active)
      }
      const beginDrag = (event: PointerEvent, keys: string[], owner: string, kind: 'patch' | 'stack', element: HTMLElement) => {
        if (event.button !== 0 || saving) return
        listRef.current?.setPointerCapture(event.pointerId)
        const bounds = element.getBoundingClientRect()
        const index = Math.min(...keys.map(key => draftPatchOrderRef.current.indexOf(key)).filter(value => value >= 0))
        const active: ActivePatchDrag = {
          keys: [...keys], owner, kind, pointerId: event.pointerId,
          originX: event.clientX, originY: event.clientY, lastX: event.clientX, lastY: event.clientY,
          moved: false, recalled: false, target: Math.max(0, index), markerVisible: false,
          x: event.clientX, y: event.clientY, width: bounds.width, height: bounds.height,
          offsetX: event.clientX - bounds.left, offsetY: event.clientY - bounds.top,
        }
        drag.current = active
        cancelLongPress()
        const timer = window.setTimeout(() => {
          if (drag.current !== active || active.moved) return
          longPress.current = null
          recallPluginPatches(active)
        }, longPressDelay)
        longPress.current = timer
      }
      const visibleDropCards = () => {
        const moving = new Set(drag.current?.keys ?? [])
        const cards: Array<{ start: number; end: number; bounds: DOMRect }> = []
        let position = 0
        for (const node of viewNodesRef.current) {
          if (node.type === 'placeholder') continue
          const keys = node.keys.filter(key => !moving.has(key))
          if (keys.length === 0) continue
          if (!node.expanded) {
            const element = coverRefs.current.get(node.id)
            if (element !== undefined) cards.push({ start: position, end: position + keys.length, bounds: element.getBoundingClientRect() })
            position += keys.length
            continue
          }
          for (const key of keys) {
            const element = patchRefs.current.get(key)
            if (element !== undefined) cards.push({ start: position, end: position + 1, bounds: element.getBoundingClientRect() })
            position += 1
          }
        }
        return cards.sort((left, right) => left.bounds.top - right.bounds.top)
      }
      const dropProjectionAt = (clientX: number, clientY: number) => {
        const cards = visibleDropCards()
        if (cards.length === 0) return { target: 0, visible: true }
        const over = cards.find(({ bounds }) => clientX >= bounds.left && clientX <= bounds.right && clientY >= bounds.top && clientY <= bounds.bottom)
        if (over !== undefined) {
          return { target: clientY < over.bounds.top + over.bounds.height / 2 ? over.start : over.end, visible: false }
        }
        const gaps = [
          { target: cards[0]!.start, y: cards[0]!.bounds.top },
          ...cards.slice(1).map((card, index) => ({
            target: card.start,
            y: (cards[index]!.bounds.bottom + card.bounds.top) / 2,
          })),
          { target: cards.at(-1)!.end, y: cards.at(-1)!.bounds.bottom },
        ]
        const nearest = gaps.reduce((current, gap) => Math.abs(clientY - gap.y) < Math.abs(clientY - current.y) ? gap : current, gaps[0]!)
        return { target: nearest.target, visible: true }
      }
      const updateDropProjection = (clientX: number, clientY: number) => {
        const active = drag.current
        if (active === null || !active.moved) return
        updateHoverExpand(clientX, clientY, active)
        const projection = dropProjectionAt(clientX, clientY)
        if (active.target === projection.target && active.markerVisible === projection.visible) return
        active.target = projection.target
        active.markerVisible = projection.visible
        captureLayout(180)
        setDragProjection({ keys: active.keys, target: projection.target, visible: projection.visible })
      }
      const moveFromPointer = (event: PointerEvent & { currentTarget: HTMLDivElement }) => {
        reconcileCollapses(event.clientY)
        reconcileMerges(event.clientY)
        const active = drag.current
        if (active?.pointerId !== event.pointerId || saving) return
        active.lastX = event.clientX
        active.lastY = event.clientY
        if (!active.moved && Math.hypot(event.clientX - active.originX, event.clientY - active.originY) < dragStartDistance) return
        let started = false
        if (!active.moved) {
          cancelLongPress()
          started = true
          setSelected(active.kind === 'patch'
            ? { kind: 'patch', key: active.keys[0]! }
            : { kind: 'plugin', key: active.owner })
          startDragging(active)
        }
        const bounds = event.currentTarget.getBoundingClientRect()
        if (event.clientY < bounds.top + 32) event.currentTarget.scrollTop -= 10
        else if (event.clientY > bounds.bottom - 32) event.currentTarget.scrollTop += 10
        setDragPreview({ ...active, x: event.clientX, y: event.clientY })
        if (started) updateHoverExpand(event.clientX, event.clientY, active)
        else updateDropProjection(event.clientX, event.clientY)
      }
      const finishDrag = (event: PointerEvent) => {
        const active = drag.current
        if (active?.pointerId !== event.pointerId) return
        cancelLongPress()
        active.lastX = event.clientX
        active.lastY = event.clientY
        const target = active.moved ? dropProjectionAt(event.clientX, event.clientY).target : active.target
        drag.current = null
        cancelHoverExpand()
        if (!active.moved && event.type === 'pointerup') {
          suppressCardClick.current = true
          window.setTimeout(() => { suppressCardClick.current = false }, 0)
          if (!active.recalled && active.kind === 'stack') {
            cancelCollapse(active.keys)
            setSelected({ kind: 'plugin', key: active.owner })
            setExpandedWithMotion(current => new Set([...current, ...active.keys]), 380)
          }
          else if (!active.recalled) {
            setSelected({ kind: 'patch', key: active.keys[0]! })
          }
        }
        if (active.moved) {
          setDraggingKeys([])
          setDragProjection(null)
          setDragPreview(null)
          setExpandedKeys(current => {
            const next = new Set(current)
            for (const key of active.keys) next.delete(key)
            return next
          })
          const nextOrder = insertPatches(draftPatchOrderRef.current, active.keys, target)
          const firstIndex = nextOrder.indexOf(active.keys[0]!)
          const lastIndex = firstIndex + active.keys.length - 1
          const nextBreaks = new Set([...stackBreaksRef.current].filter(boundary => {
            const [left, right] = boundary.split('\0')
            const index = nextOrder.indexOf(left!)
            return index >= 0 && nextOrder[index + 1] === right
          }))
          const previous = nextOrder[firstIndex - 1]
          const next = nextOrder[lastIndex + 1]
          if (previous !== undefined && patchOwner(previous, patchMap) === active.owner) nextBreaks.add(stackBoundary(previous, active.keys[0]!))
          if (next !== undefined && patchOwner(next, patchMap) === active.owner) nextBreaks.add(stackBoundary(active.keys.at(-1)!, next))
          stackBreaksRef.current = nextBreaks
          const left = active.lastX - active.offsetX
          const top = active.lastY - active.offsetY
          const statuses = stackStatuses(active.keys)
          const previewBounds = new Map(active.keys.map((key, depth) => {
            const layer = active.kind === 'stack' && active.keys.length > 1
              ? stackLayer(statuses, depth)
              : { bottom: 0, left: 0, right: 0 }
            const height = patchRefs.current.get(key)?.getBoundingClientRect().height ?? active.height
            const y = active.kind === 'stack' && active.keys.length > 1 ? top + active.height + layer.bottom - height : top
            return [key, new DOMRect(left + layer.left, y, active.width - layer.left - layer.right, height)] as const
          }))
          applyPatchOrder(nextOrder, previewBounds)
          requestAnimationFrame(() => reconcileMerges(event.clientY))
        }
        reconcileCollapses(event.clientY)
      }
      finishDragRef.current = finishDrag
      const scrollWhileDragging = (event: WheelEvent) => {
        const active = drag.current
        const list = listRef.current
        if (!active?.moved || list === null) return
        const bounds = list.getBoundingClientRect()
        if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) {
          event.preventDefault()
          list.scrollTop += event.deltaY
        }
        requestAnimationFrame(() => updateDropProjection(active.lastX, active.lastY))
      }
      const finishPrompt = (allow: boolean) => {
        const prompt = pendingClose.current
        if (prompt === null) return
        pendingClose.current = null
        setClosePrompt(null)
        prompt.resolve(allow)
      }
      useModalFocus(closePrompt !== null, closeLayer, closeDialog, promptButton, () => finishPrompt(false))

      if (loading) return h('div', { className: 'dshHarmonyPage' },
        h('h2', { className: 'dshHarmonyHeading' }, t('title')),
        h('p', { className: 'dshHarmonyIntro' }, t('loading')),
        h('div', { className: 'dshHarmonySkeleton', 'aria-hidden': 'true' }, h('div'), h('div')))
      if (view === null) return h('div', { className: 'dshHarmonyPage' },
        h('h2', { className: 'dshHarmonyHeading' }, t('title')),
        h('p', { className: 'dshHarmonyStatus dshHarmonyError', role: 'alert' }, `${t('loadError')} ${error}`),
        h('button', { className: 'dshHarmonySecondary', type: 'button', onClick: () => { void load() } }, t('retry')))

      const compatibilityDeclaration = (field: keyof PluginView['compatibility'], label: TranslationKey): string => {
        if (selectedPlugin === undefined) return ''
        const declarations = Object.entries(selectedPlugin.compatibility[field])
        return declarations.length === 0 ? '' : `${t(label)}: ${declarations
          .map(([name, range]) => range === '*' ? name : `${name}@${range}`).join(', ')}`
      }
      const compatibilityWarnings = view.compatibility.filter(item => item.kind !== 'integration')
      const compatibilityWarning = (item: typeof compatibilityWarnings[number]): string => item.kind === 'conflict'
        ? `${item.left.package}@${item.left.version} ↔ ${item.right.package}@${item.right.version}`
        : `${item.owner.package}@${item.owner.version} → ${item.target.package}@${item.target.range} (${t({
            missing: 'requirementMissing', inactive: 'requirementInactive', version: 'requirementVersion',
          }[item.reason] as TranslationKey)})`
      const constraints = selectedPlugin === undefined ? [] : [
        selectedPlugin.before.length > 0 ? `${t('before')}: ${selectedPlugin.before.join(', ')}` : '',
        selectedPlugin.after.length > 0 ? `${t('after')}: ${selectedPlugin.after.join(', ')}` : '',
        compatibilityDeclaration('requires', 'requires'),
        compatibilityDeclaration('conflicts', 'conflicts'),
        compatibilityDeclaration('integrates', 'integrates'),
      ].filter(Boolean)
      const renderPatch = (key: string, stack: PatchStackNode, depth = 0) => {
        const patch = patchMap.get(key)
        const index = draftPatchOrder.indexOf(key)
        const owner = patch?.owner ?? key.slice(0, Math.max(0, key.lastIndexOf('/')))
        const stacked = !stack.expanded
        const status = cardStatus(key)
        const geometry = stackGeometry(stackStatuses(stack.keys))
        const layer = stackLayer(stackStatuses(stack.keys), depth)
        return h('div', {
          className: 'dshHarmonyPatchItem',
          key,
          role: 'listitem',
          style: stacked ? {
            bottom: `${geometry.height - layer.bottom}px`,
            right: `${layer.right}px`,
            left: `${layer.left}px`,
            zIndex: stack.keys.length - depth,
          } : undefined,
        },
          h('button', {
            ref: (element: HTMLButtonElement | null) => element === null ? patchRefs.current.delete(key) : patchRefs.current.set(key, element),
            type: 'button',
            className: 'dshHarmonyPatchCard',
            'data-patch-key': key,
            'data-status': status,
            'data-selected': selected?.kind === 'patch' && selected.key === key ? 'true' : undefined,
            'data-owner-selected': selectedOwner === owner ? 'true' : undefined,
            'data-dragging': draggingKeys.includes(key) ? 'true' : undefined,
            'aria-hidden': stacked ? 'true' : undefined,
            'aria-label': `${key} · ${stackHealthTitle([key])} · ${index + 1}/${draftPatchOrder.length}`,
            tabIndex: stacked ? -1 : undefined,
            onClick: () => {
              if (suppressCardClick.current) {
                suppressCardClick.current = false
                return
              }
              setSelected({ kind: 'patch', key })
            },
            onPointerDown: (event: PointerEvent & { currentTarget: HTMLButtonElement }) => beginDrag(event, [key], owner, 'patch', event.currentTarget),
            onKeyDown: (event: KeyboardEvent) => {
              if (event.key === 'Escape' && stack.expanded) {
                event.preventDefault()
                event.stopPropagation()
                collapseStack(stack)
                requestAnimationFrame(() => coverRefs.current.get(stack.id)?.querySelector<HTMLButtonElement>('button')?.focus())
                return
              }
              if (!event.altKey || event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
              event.preventDefault()
              moveByKeyboard(key, event.key === 'ArrowUp' ? -1 : 1)
            },
          },
          h('span', { className: 'dshHarmonyPatchGrip', 'aria-hidden': 'true' }),
          h('span', { className: 'dshHarmonyIndex' }, String(index + 1).padStart(2, '0')),
          h('span', { className: 'dshHarmonyPatchText' },
            h('span', { className: 'dshHarmonyPatchName', title: key }, patch?.id ?? key.slice(owner.length + 1)),
            h('span', { className: 'dshHarmonyPatchOwner' }, displayName(owner))),
          h('span', { className: 'dshHarmonyOrderState', 'data-state': patch?.state, title: stackHealthTitle([key]) })))
      }

      return h('div', { className: 'dshHarmonyPage', onWheel: scrollWhileDragging },
        h('nav', { className: 'dshHarmonyTabs', role: 'tablist', 'aria-label': t('nav') },
          h('button', {
            className: 'dshHarmonyTab', type: 'button', role: 'tab', 'aria-selected': page === 'order',
            onClick: () => setPage('order'),
          }, t('orderPage')),
          h('button', {
            className: 'dshHarmonyTab', type: 'button', role: 'tab', 'aria-selected': page === 'patches',
            onClick: () => setPage('patches'),
          }, t('patchPage'))),
        compatibilityWarnings.length > 0
          ? h('p', { className: 'dshHarmonyWarning', role: 'status' },
            `${t('compatibilityWarning')} ${compatibilityWarnings.map(compatibilityWarning).join(' · ')}`)
          : null,
        page === 'patches' ? h(PatchStatusPage, { t, selected: statusPatch, onSelect: setStatusPatch, syntaxHighlighter }) : h(React.Fragment, null,
        h('header', null,
          h('h2', { className: 'dshHarmonyHeading' }, t('title')),
          h('p', { className: 'dshHarmonyIntro' }, t('intro'))),
        h('div', { className: 'dshHarmonyWorkspace' },
          draftPatchOrder.length === 0
            ? h('p', { className: 'dshHarmonyStatus' }, t('orderEmpty'))
            : h('div', {
              ref: listRef,
              className: 'dshHarmonyList',
              role: 'list',
              'aria-label': t('title'),
              'data-has-selection': selectedOwner === undefined ? undefined : 'true',
              onPointerMove: moveFromPointer,
              onPointerLeave: (event: PointerEvent) => {
                for (const group of expandedGroups()) scheduleCollapse(group.owner, group.expandedKeys)
                reconcileMerges(event.clientY)
              },
              onPointerUp: finishDrag,
              onPointerCancel: finishDrag,
            }, viewNodes.map(node => {
              if (node.type === 'placeholder') return h('div', { className: 'dshHarmonyPatchItem', key: 'drag-placeholder', role: 'listitem' },
                h('div', { className: 'dshHarmonyDropSlot', role: 'status', 'aria-label': `${t('dropAt')} ${node.index + 1}` }))
              const singleton = node.keys.length === 1
              const plugin = plugins.get(node.owner)
              return h('div', {
                key: node.id,
                className: 'dshHarmonyStack',
                role: 'presentation',
                'data-collapsed': node.expanded ? undefined : 'true',
                'data-expanded': node.expanded ? 'true' : undefined,
                'data-singleton': singleton ? 'true' : undefined,
                'data-selected': selected?.kind === 'plugin' && selected.key === node.owner ? 'true' : undefined,
                'data-owner-selected': selectedOwner === node.owner ? 'true' : undefined,
                'data-dragging': node.keys.every(key => draggingKeys.includes(key)) ? 'true' : undefined,
                style: node.expanded || singleton ? undefined : { paddingBottom: `${stackGeometry(stackStatuses(node.keys)).height}px` },
                onPointerDown: (event: PointerEvent & { currentTarget: HTMLDivElement }) => {
                  if (node.expanded) return
                  beginDrag(event, node.keys, node.owner, 'stack', coverRefs.current.get(node.id) ?? event.currentTarget)
                },
                onClick: (event: MouseEvent) => {
                  if (node.expanded) return
                  if (suppressCardClick.current) {
                    suppressCardClick.current = false
                    return
                  }
                  setSelected({ kind: 'plugin', key: node.owner })
                  expandStack(node, event.detail === 0 ? undefined : event.clientY)
                  if (singleton && event.detail === 0) {
                    requestAnimationFrame(() => patchRefs.current.get(node.keys[0]!)?.focus())
                  }
                },
              },
              h('div', {
                ref: (element: HTMLDivElement | null) => element === null ? coverRefs.current.delete(node.id) : coverRefs.current.set(node.id, element),
                className: 'dshHarmonyStackCover',
                role: node.expanded ? undefined : 'listitem',
                'aria-hidden': node.expanded ? 'true' : undefined,
                style: { background: stackCoverColor(node.keys) },
              },
                h('button', {
                  className: 'dshHarmonyStackSummary', type: 'button',
                  'aria-expanded': node.expanded,
                  'aria-label': singleton ? `${t('showPatch')}: ${node.owner}` : `${t(node.expanded ? 'collapseStack' : 'expandStack')}: ${node.owner}`,
                  tabIndex: node.expanded ? -1 : undefined,
                  onKeyDown: singleton ? (event: KeyboardEvent) => {
                    if (!event.altKey || event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
                    event.preventDefault()
                    moveByKeyboard(node.keys[0]!, event.key === 'ArrowUp' ? -1 : 1, () => {
                      coverRefs.current.get(node.id)?.querySelector<HTMLButtonElement>('button')?.focus()
                    })
                  } : undefined,
                },
                h('span', { className: 'dshHarmonyStackGlyph', 'aria-hidden': 'true' }, listName(node.owner).charAt(0).toUpperCase()),
                  h('span', { className: 'dshHarmonyStackText' },
                  h('span', { className: 'dshHarmonyName', title: node.owner }, listName(node.owner)),
                  h('span', { className: 'dshHarmonyStackMeta' }, singleton
                    ? [plugin?.version ? `v${plugin.version}` : '', `1 ${patchCountLabel(1)}`, patchMap.get(node.keys[0]!)?.id ?? node.keys[0]].filter(Boolean).join(' · ')
                    : `${node.keys.length} ${patchCountLabel(node.keys.length)} · ${node.start + 1}–${node.end}`)),
                h('span', {
                  className: 'dshHarmonyOrderState dshHarmonyStackState',
                  style: { background: stackHealthColor(node.keys) },
                  title: stackHealthTitle(node.keys),
                  'aria-label': stackHealthTitle(node.keys),
                }))),
              singleton && !node.expanded ? null : h('div', { className: 'dshHarmonyStackPatches', inert: node.expanded ? undefined : true }, node.keys.map((key, depth) => renderPatch(key, node, depth))))
            })),
          selectedPatch !== undefined
            ? h('section', { className: 'dshHarmonyDetail', 'aria-live': 'polite' },
              h('div', { className: 'dshHarmonyIdentity' },
                h('div', { className: 'dshHarmonyMeta' },
                  h('h3', { className: 'dshHarmonyTitle' }, selectedPatch.id),
                  h('span', { className: 'dshHarmonyVersion' }, orderStateLabel(patchOrderState(selectedPatch)))),
                h('p', { className: 'dshHarmonyScope' }, selectedPatch.key)),
              h('p', { className: 'dshHarmonyDescription' }, selectedPatch.description || t('noPatchDescription')),
              h('div', { className: 'dshHarmonyFacts' },
                h('span', null, patchTypeLabel(t, selectedPatch)),
                h('span', null, `${t('patchProvider')}: ${displayName(selectedPatch.owner)}`),
                selectedAuthor ? h('span', null, `${t('author')}: ${selectedAuthor}`) : null,
                h('span', null, `${t('patchTarget')}: ${patchTargetLabel(selectedPatch)}`),
                h('span', null, `${t('patchDeclaration')}: ${selectedPatch.declaration}`),
                h('span', null, `${t('patchMatches')}: ${selectedPatch.matches}`),
                h('span', null, `${t('patchGeneration')}: ${selectedPatch.generation}`)),
              selectedPatch.members === undefined ? null : h('p', { className: 'dshHarmonyConstraint' }, selectedPatch.members.map(member => `${member.id} · ${patchKindLabel(t, member.kind)}`).join(' · ')),
              (selectedPatch.warnings ?? []).map(warning => h('p', { className: 'dshHarmonyWarning', role: 'status', key: warning }, warning)),
              selectedPatch.error ? h('p', { className: 'dshHarmonyConstraint dshHarmonyError', role: 'alert' }, selectedPatch.error) : null,
              h('div', { className: 'dshHarmonyDetailActions' },
                h('button', {
                  className: 'dshHarmonySecondary', type: 'button', disabled: saving,
                  onClick: () => toggleDisabled(selectedPatch.key),
                }, t(draftDisabled.includes(selectedPatch.key) ? 'enablePatch' : 'disablePatch')),
                h('button', {
                  className: 'dshHarmonySecondary', type: 'button',
                  onClick: () => { setStatusPatch(selectedPatch.key); setPage('patches') },
                }, t('viewPatchDetails'))))
            : selectedPlugin === undefined ? h('p', { className: 'dshHarmonyStatus' }, t('noDescription')) :
              h('section', { className: 'dshHarmonyDetail', 'aria-live': 'polite' },
              h('div', { className: 'dshHarmonyPreview' },
                selectedPlugin.name === harmonyPlugin
                  ? h(React.Fragment, null,
                    h('img', { className: 'dshHarmonyPreviewImage dshHarmonyPreviewImageLight', src: '/dsh-harmony/assets/harmony-preview-light.webp', alt: '' }),
                    h('img', { className: 'dshHarmonyPreviewImage dshHarmonyPreviewImageDark', src: '/dsh-harmony/assets/harmony-preview.webp', alt: '' }))
                  : h(React.Fragment, null,
                    h('div', { className: 'dshHarmonyPreviewMark', 'aria-hidden': 'true' }, selectedPlugin.name.replace(/^@[^/]+\//, '').charAt(0).toUpperCase()),
                    h('span', { className: 'dshHarmonyPreviewLabel' }, t('preview')))),
              h('div', { className: 'dshHarmonyIdentity' },
                h('div', { className: 'dshHarmonyMeta' },
                  h('h3', { className: 'dshHarmonyTitle' }, displayName(selectedPlugin.name)),
                  selectedPlugin.version ? h('span', { className: 'dshHarmonyVersion' }, `v${selectedPlugin.version}`) : null)),
              h('p', { className: 'dshHarmonyDescription' }, selectedPlugin.description || t('noDescription')),
              h('div', { className: 'dshHarmonyFacts' },
                selectedAuthor ? h('span', null, `${t('author')}: ${selectedAuthor}`) : null,
                selectedPlugin.contributors.length > 0 ? h('span', null, `${t('contributors')}: ${selectedPlugin.contributors.join(', ')}`) : null,
                selectedPlugin.license ? h('span', null, `${t('license')}: ${selectedPlugin.license}`) : null,
                selectedPlugin.harmony ? h('span', null, `${t('patchCount')}: ${selectedPlugin.patchCount}`) : null,
                selectedPlugin.homepage ? h('a', { href: selectedPlugin.homepage, target: '_blank', rel: 'noreferrer' }, t('homepage')) : null,
                selectedPlugin.bugs ? h('a', { href: selectedPlugin.bugs, target: '_blank', rel: 'noreferrer' }, t('bugs')) : null),
              selectedPlugin.harmony && constraints.length > 0
                ? h('p', { className: 'dshHarmonyConstraint' }, constraints.join(' · '))
                : null,
              selectedPlugin.harmony
                ? h('div', { className: 'dshHarmonyDetailActions' },
                  h('button', {
                    className: 'dshHarmonySecondary', type: 'button', disabled: saving,
                    onClick: () => toggleDisabled(`${selectedPlugin.name}/*`),
                  }, t(draftDisabled.includes(`${selectedPlugin.name}/*`) ? 'enablePluginPatches' : 'disablePluginPatches')))
                : null)),
        dragPreview === null ? null : h('div', {
          className: 'dshHarmonyDragPreview',
          'aria-hidden': 'true',
          style: {
            left: `${dragPreview.x - dragPreview.offsetX}px`,
            top: `${dragPreview.y - dragPreview.offsetY}px`,
            width: `${dragPreview.width}px`,
          },
        }, dragPreview.kind === 'patch'
          ? h('div', { className: 'dshHarmonyDragPatch', 'data-status': cardStatus(dragPreview.keys[0]!) },
            h('span', { className: 'dshHarmonyPatchGrip' }),
            h('span', { className: 'dshHarmonyDragTitle' }, patchMap.get(dragPreview.keys[0]!)?.id ?? dragPreview.keys[0]),
            h('span', { className: 'dshHarmonyDragMeta' }, displayName(dragPreview.owner)))
          : h('div', { className: 'dshHarmonyDragStack', style: { height: `${dragPreview.height + (dragPreview.keys.length === 1 ? 0 : stackGeometry(stackStatuses(dragPreview.keys)).height)}px` } },
            dragPreview.keys.length === 1 ? null : dragPreview.keys.map((key, depth) => {
              const statuses = stackStatuses(dragPreview.keys)
              const geometry = stackGeometry(statuses)
              const layer = stackLayer(statuses, depth)
              return h('div', {
                className: 'dshHarmonyDragLayer', key,
                'data-status': cardStatus(key),
                style: {
                  bottom: `${geometry.height - layer.bottom}px`, right: `${layer.right}px`, left: `${layer.left}px`,
                  zIndex: dragPreview.keys.length - depth,
                },
              })
            }),
            h('div', { className: 'dshHarmonyDragCover', style: { height: `${dragPreview.height}px`, background: stackCoverColor(dragPreview.keys) } },
              h('span', { className: 'dshHarmonyStackGlyph' }, listName(dragPreview.owner).charAt(0).toUpperCase()),
              h('span', { className: 'dshHarmonyDragTitle' }, listName(dragPreview.owner)),
              h('span', { className: 'dshHarmonyDragMeta' }, `${dragPreview.keys.length} ${patchCountLabel(dragPreview.keys.length)}`),
              h('span', { className: 'dshHarmonyOrderState dshHarmonyStackState', style: { background: stackHealthColor(dragPreview.keys) } })))),
        h('footer', { className: 'dshHarmonyFooter' },
          h('p', { className: 'dshHarmonySrOnly', role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' }, announcement),
          h('p', { className: 'dshHarmonyHint' }, t('keyboard')),
          h('div', { className: 'dshHarmonyFooterActions' },
            h('button', { className: 'dshHarmonySecondary', type: 'button', disabled: !dirty || saving, onClick: undoDraft }, t('undo')),
            h('button', { className: 'dshHarmonyButton', type: 'button', disabled: !dirty || saving, onClick: () => { void save().catch(() => {}) } }, saving ? t('saving') : t('save')))),
        error ? h('p', { className: 'dshHarmonyHint dshHarmonyError', role: 'alert' }, `${t('loadError')} ${error}`) : null,
        closePrompt ? h('div', { className: 'dshHarmonyConfirmLayer', role: 'presentation', ref: closeLayer },
          h('div', { className: 'dshHarmonyConfirm', role: 'alertdialog', 'aria-modal': 'true', 'aria-labelledby': 'dsh-harmony-confirm-title', ref: closeDialog, tabIndex: -1 },
            h('h3', { id: 'dsh-harmony-confirm-title' }, t('confirmTitle')),
            h('p', null, t('confirmBody')),
            h('div', { className: 'dshHarmonyConfirmActions' },
              h('button', { className: 'dshHarmonySecondary', type: 'button', onClick: () => finishPrompt(false) }, t('cancel')),
              h('button', { className: 'dshHarmonySecondary', type: 'button', onClick: () => finishPrompt(true) }, t('discard')),
              h('button', {
                ref: promptButton,
                className: 'dshHarmonyButton', type: 'button', disabled: saving,
                onClick: () => { void saveRef.current?.().then(() => finishPrompt(true)).catch(() => {}) },
              }, saving ? t('saving') : t('saveExit'))))) : null))
    }

    function HarmonyPluginSettingsCard({ t }: { t: Translate }) {
      const [open, setOpen] = useState(false)
      const [profile, setProfile] = useState<ProfileView | null>(null)
      const [saving, setSaving] = useState(false)
      const [error, setError] = useState('')
      const [ownerLinkReady, setOwnerLinkReady] = useState(false)
      const ownerHoverStartedAt = useRef<number | null>(null)
      const ownerReadyTimer = useRef<number | null>(null)

      const load = async () => {
        const response = await fetch('/dsh-harmony/profile', { cache: 'no-store' })
        if (!response.ok) throw new Error(`${response.status}`)
        setProfile(await response.json() as ProfileView)
      }
      useEffect(() => { void load().catch(reason => setError(reason instanceof Error ? reason.message : String(reason))) }, [])
      useEffect(() => () => {
        if (ownerReadyTimer.current !== null) window.clearTimeout(ownerReadyTimer.current)
      }, [])

      const beginOwnerHover = () => {
        if (ownerReadyTimer.current !== null) window.clearTimeout(ownerReadyTimer.current)
        ownerHoverStartedAt.current = Date.now()
        setOwnerLinkReady(false)
        ownerReadyTimer.current = window.setTimeout(() => {
          ownerReadyTimer.current = null
          setOwnerLinkReady(true)
        }, 300)
      }

      const endOwnerHover = () => {
        if (ownerReadyTimer.current !== null) window.clearTimeout(ownerReadyTimer.current)
        ownerReadyTimer.current = null
        ownerHoverStartedAt.current = null
        setOwnerLinkReady(false)
      }

      const activateOwnerLink = (event: MouseEvent) => {
        if (event.detail === 0) return
        const startedAt = ownerHoverStartedAt.current
        if (ownerLinkReady || typeof startedAt === 'number' && Date.now() - startedAt >= 300) return
        event.preventDefault()
        setOpen(current => !current)
      }

      const selectThreads = async (nextThreads: number) => {
        if (profile === null || nextThreads === profile.workerThreads) return
        const previous = profile
        setProfile({ ...profile, workerThreads: nextThreads })
        setSaving(true)
        setError('')
        try {
          const response = await fetch('/dsh-harmony/profile', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ expectedRevision: profile.revision, workerThreads: nextThreads }),
          })
          const updated = await response.json() as ProfileView & { error?: string }
          if (!response.ok) throw new Error(updated.error ?? `${response.status}`)
          setProfile(updated)
        } catch (reason) {
          setProfile(previous)
          setError(reason instanceof Error ? reason.message : String(reason))
        } finally {
          setSaving(false)
        }
      }

      return h('li', { className: 'dshHarmonyWorkerCard', 'data-open': open ? 'true' : 'false' },
        h('div', { className: 'dshHarmonyWorkerHeader' },
          h('button', {
            className: 'dshHarmonyWorkerHeaderButton',
            type: 'button',
            'aria-expanded': open,
            'aria-controls': 'dsh-harmony-worker-body',
            'aria-label': t(open ? 'harmonySettingsCollapse' : 'harmonySettingsExpand'),
            onClick: () => setOpen(current => !current),
          }),
          h('span', { className: 'dshHarmonyWorkerText' },
            h('span', { className: 'dshHarmonyWorkerTitleRow' },
              h('span', { className: 'dshHarmonyWorkerTitle' }, t('harmonySettingsTitle')),
              h('a', {
                className: 'dshHarmonyWorkerPlugin',
                href: 'https://github.com/memorax-ai/dsh-harmony',
                target: '_blank',
                rel: 'noreferrer',
                'data-ready': ownerLinkReady ? 'true' : 'false',
                onPointerEnter: beginOwnerHover,
                onPointerLeave: endOwnerHover,
                onClick: activateOwnerLink,
              }, 'dsh-harmony')),
            h('span', { className: 'dshHarmonyWorkerDescription' }, t('harmonySettingsDescription'))),
          h('svg', {
            className: 'dshHarmonyWorkerChevron',
            width: 14,
            height: 14,
            viewBox: '0 0 14 14',
            'aria-hidden': 'true',
          }, h('path', {
            d: 'M3.5 5.25 7 8.75l3.5-3.5',
            fill: 'none',
            stroke: 'currentColor',
            strokeWidth: 1.5,
            strokeLinecap: 'round',
            strokeLinejoin: 'round',
          }))),
        open ? h('div', { className: 'dshHarmonyWorkerBody', id: 'dsh-harmony-worker-body' },
          error ? h('p', { className: 'dshHarmonyWorkerError', role: 'alert' }, `${t('workerThreadsError')} ${error}`) : null,
          h('div', { className: 'dshHarmonyWorkerSetting' },
            h('span', { className: 'dshHarmonyWorkerSettingText' },
              h('span', { className: 'dshHarmonyWorkerSettingTitle' }, t('workerThreadsTitle')),
              h('span', { className: 'dshHarmonyWorkerSettingDescription' }, t('workerThreadsDescription'))),
            h('div', { className: 'dshHarmonyWorkerControl' },
              h('label', { className: 'dshHarmonyWorkerFieldLabel', htmlFor: 'dsh-harmony-worker-threads' }, t('workerThreadsField')),
              h('select', {
                id: 'dsh-harmony-worker-threads',
                className: 'dshHarmonyWorkerSelect',
                value: String(profile?.workerThreads ?? 1),
                disabled: profile === null || saving,
                onChange: (event: Event & { currentTarget: HTMLSelectElement }) => {
                  void selectThreads(Number(event.currentTarget.value))
                },
              }, Array.from({ length: 32 }, (_, index) => index + 1).map(count => h('option', { key: count, value: count },
                `${count} ${t('workerThreadsOption')}`))))),
          saving ? h('span', { className: 'dshHarmonySrOnly', role: 'status' }, t('workerThreadsSaving')) : null) : null)
    }

    const inject = ['slots', 'locale']
    function apply(ctx: HarmonyClientContext) {
      ctx.effect(() => ctx.locale.register(localeNamespace, dictionaries), 'dsh-harmony: dictionaries')
      ctx.effect(() => {
        const observer = new MutationObserver(schedulePatchStyleReorder)
        observer.observe(document.head, { childList: true })
        void refreshPatchStyleOrder().catch(() => {})
        return () => observer.disconnect()
      }, 'dsh-harmony: Patch style order')
      const t = ctx.locale.bind(localeNamespace)
      ctx.slots.inject('shell.overlay', () => ctx.slots.register({
        name: 'shell.overlay',
        id: 'harmony-runtime',
        order: -110,
        locale: localeNamespace,
      }, RuntimePrompt))
      ctx.slots.inject('shell.overlay', () => ctx.slots.register({
        name: 'shell.overlay',
        id: 'harmony-reload-notifications',
        order: -109,
        locale: localeNamespace,
      }, ReloadNotifications))
      ctx.slots.inject('shell.overlay', () => ctx.slots.register({
        name: 'shell.overlay',
        id: 'harmony-instance-patch-profile',
        order: -107,
        locale: localeNamespace,
      }, InstancePatchPrompt))
      ctx.effect(async () => {
        const status = await fetch('/dsh-harmony/runtime', { cache: 'no-store' }).then(response => response.json())
        if (status.state !== 'active') return
        const SettingsSection = (props: { t: Translate }) => h(HarmonySettings, {
          ...props,
          syntaxHighlighter: ctx.get('syntaxHighlighter') as SyntaxHighlighterService | undefined,
        })
        const disposeWorkerCard = ctx.slots.inject('settings.plugin.item', () => ctx.slots.register({
          name: 'settings.plugin.item',
          key: 'dsh-harmony',
          locale: localeNamespace,
        }, HarmonyPluginSettingsCard)) as () => void
        const disposeSection = ctx.slots.inject('settings.section', () => ctx.slots.register({
          name: 'settings.section',
          id: 'harmony',
          order: 35,
          label: () => t('nav'),
          locale: localeNamespace,
        }, SettingsSection)) as () => void
        return () => {
          disposeSection()
          disposeWorkerCard()
        }
      }, 'dsh-harmony: settings section')
    }

    exports.apply = apply
    exports.inject = inject
    return module.exports
  },
})
