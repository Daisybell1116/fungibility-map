import React, { useState, useMemo, useCallback } from "react";
import { RotateCcw, Sparkles } from "lucide-react";

const AMBER = "#E0A458";
const BLUE = "#5C82AD";

const SEED_NODES = [
{ id: "auto", label: "Automation", note: "decision loop", parentId: null, depth: 0, color: AMBER },
{ id: "mat", label: "Materials", note: "substrate", parentId: null, depth: 0, color: BLUE },
{ id: "robotics", label: "Robotics", note: null, parentId: "auto", depth: 1, color: AMBER },
{ id: "algo", label: "Algorithmic Control", note: null, parentId: "auto", depth: 1, color: AMBER },
{ id: "auton", label: "Autonomous Systems", note: null, parentId: "auto", depth: 1, color: AMBER },
{ id: "semi", label: "Semiconductors", note: null, parentId: "mat", depth: 1, color: BLUE },
{ id: "comp", label: "Composites", note: null, parentId: "mat", depth: 1, color: BLUE },
{ id: "bio", label: "Biomaterials", note: null, parentId: "mat", depth: 1, color: BLUE },
];

const DEPTH_X = 175;
const MARGIN_X = 70;
const SLOT_H = 34;
const MARGIN_Y = 30;

function radiusFor(depth) {
return Math.max(4, 12 - depth * 1.6);
}
function fontFor(depth) {
return Math.max(8, 13 - depth * 1.1);
}
function opacityFor(depth) {
return Math.max(0.55, 1 - depth * 0.09);
}

export default function LiveFungibilityMap() {
const [nodes, setNodes] = useState(SEED_NODES);
const [loadingIds, setLoadingIds] = useState(new Set());
const [errorIds, setErrorIds] = useState(new Set());
const [collapsedIds, setCollapsedIds] = useState(new Set());

const childrenMap = useMemo(() => {
const m = {};
nodes.forEach((n) => {
if (n.parentId) {
m[n.parentId] = m[n.parentId] || [];
m[n.parentId].push(n.id);
}
});
return m;
}, [nodes]);

const hiddenSet = useMemo(() => {
const hidden = new Set();
const stack = [...collapsedIds];
const seen = new Set();
while (stack.length) {
const id = stack.pop();
if (seen.has(id)) continue;
seen.add(id);
const kids = childrenMap[id] || [];
kids.forEach((k) => {
hidden.add(k);
stack.push(k);
});
}
return hidden;
}, [collapsedIds, childrenMap]);

const layout = useMemo(() => {
const visible = nodes.filter((n) => !hiddenSet.has(n.id));
const visibleIds = new Set(visible.map((n) => n.id));
const vChildren = {};
visible.forEach((n) => {
if (n.parentId && visibleIds.has(n.parentId)) {
vChildren[n.parentId] = vChildren[n.parentId] || [];
vChildren[n.parentId].push(n.id);
}
});
const roots = visible.filter((n) => n.parentId === null).map((n) => n.id);
const y = {};
let leafCounter = 0;
function assign(id) {
const kids = vChildren[id] || [];
if (kids.length === 0) {
y[id] = MARGIN_Y + leafCounter * SLOT_H;
leafCounter++;
return y[id];
}
const kidYs = kids.map(assign);
y[id] = (Math.min(...kidYs) + Math.max(...kidYs)) / 2;
return y[id];
}
roots.forEach(assign);

const maxDepth = Math.max(...visible.map((n) => n.depth), 0);
const width = MARGIN_X + maxDepth * DEPTH_X + 260;
const height = MARGIN_Y * 2 + Math.max(leafCounter - 1, 0) * SLOT_H + 20;
const pos = {};
visible.forEach((n) => {
pos[n.id] = { x: MARGIN_X + n.depth * DEPTH_X, y: y[n.id] };
});
return {
visible,
pos,
width: Math.max(width, 600),
height: Math.max(height, 400),
vChildren,
};
}, [nodes, hiddenSet]);

const expandNode = useCallback(
async (nodeId) => {
const node = nodes.find((n) => n.id === nodeId);
if (!node) return;
const hasChildren = (childrenMap[nodeId] || []).length > 0;
if (hasChildren) {
setCollapsedIds((prev) => {
const s = new Set(prev);
if (s.has(nodeId)) s.delete(nodeId);
else s.add(nodeId);
return s;
});
return;
}

const ancestry = [];
let cur = node;
const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));
while (cur) {
ancestry.unshift(cur.label);
cur = cur.parentId ? byId[cur.parentId] : null;
}

setLoadingIds((prev) => new Set(prev).add(nodeId));
setErrorIds((prev) => {
const s = new Set(prev);
s.delete(nodeId);
return s;
});

const systemPrompt =
"You help build a branching concept map about fungibility \u2014 how a resource, " +
"technology, or capability can substitute for another. Given an ancestry path and a " +
"current node, respond ONLY with a JSON array of exactly 3 objects, no markdown, no " +
"preamble, no code fences. Each object has a \"label\" field (2-5 words, concrete, " +
"title case) and a \"note\" field (a short italic-style aside, under 8 words, or null).";

const userPrompt = `Ancestry path (root to current): ${ancestry.join(" -> ")}\nCurrent node: ${node.label}${
node.note ? ` (${node.note})` : ""
}\n\nGenerate 3 child concepts that represent the next generation down this branch \u2014 things this node substitutes for, decomposes into, or is fungible with.`;

try {
const response = await fetch("/api/expand", {
method: "POST",
headers: { "Content-Type": "application/json" },
body: JSON.stringify({ system: systemPrompt, prompt: userPrompt }),
});
if (!response.ok) throw new Error("bad response");
const data = await response.json();
const textBlock = (data.content || []).find((b) => b.type === "text");
if (!textBlock) throw new Error("no text block");
const clean = textBlock.text.replace(/```json|```/g, "").trim();
const parsed = JSON.parse(clean);
if (!Array.isArray(parsed)) throw new Error("not an array");
const newNodes = parsed.slice(0, 3).map((item, i) => ({
id: `${nodeId}-${Date.now()}-${i}`,
label: String(item.label || "untitled").slice(0, 40),
note: item.note ? String(item.note).slice(0, 60) : null,
parentId: nodeId,
depth: node.depth + 1,
color: node.color,
}));
setNodes((prev) => [...prev, ...newNodes]);
} catch (err) {
setErrorIds((prev) => new Set(prev).add(nodeId));
setTimeout(() => {
setErrorIds((prev) => {
const s = new Set(prev);
s.delete(nodeId);
return s;
});
}, 3500);
} finally {
setLoadingIds((prev) => {
const s = new Set(prev);
s.delete(nodeId);
return s;
});
}
},
[nodes, childrenMap]
);

const reset = useCallback(() => {
setNodes(SEED_NODES);
setCollapsedIds(new Set());
setLoadingIds(new Set());
setErrorIds(new Set());
}, []);

return (
<div className="w-full h-full min-h-screen bg-[#0F1115] text-[#EDEAE3] flex flex-col font-sans">
<div className="px-4 pt-5 pb-3 border-b border-[#2A2D33]">
<div className="flex items-center justify-between gap-3">
<div>
<h1 className="text-lg" style={{ fontFamily: "Georgia, serif" }}>
Live Fungibility Map
</h1>
<p className="text-[10px] text-[#8A8781] mt-1 tracking-wide">
TAP ANY NODE TO GROW ITS NEXT GENERATION — GENERATED LIVE
</p>
</div>
<button
onClick={reset}
className="flex items-center gap-1.5 text-[11px] px-2.5 py-1.5 rounded border border-[#2A2D33] text-[#8A8781] hover:text-[#EDEAE3] hover:border-[#8A8781] transition-colors"
>
<RotateCcw size={12} />
Reset
</button>
</div>
<div className="flex items-center gap-4 mt-3 text-[10px] text-[#8A8781]">
<span className="flex items-center gap-1.5">
<span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: AMBER }} />
automation lineage
</span>
<span className="flex items-center gap-1.5">
<span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: BLUE }} />
materials lineage
</span>
</div>
</div>

<div className="flex-1 overflow-auto">
<svg width={layout.width} height={layout.height} viewBox={`0 0 ${layout.width} ${layout.height}`} style={{ display: "block" }}>
<rect width={layout.width} height={layout.height} fill="#0F1115" />
{layout.visible.map((n) => {
if (!n.parentId) return null;
const p = layout.pos[n.parentId];
const c = layout.pos[n.id];
if (!p || !c) return null;
const d = `M ${p.x},${p.y} C ${(p.x + c.x) / 2},${p.y} ${(p.x + c.x) / 2},${c.y} ${c.x},${c.y}`;
return (
<path
key={`edge-${n.id}`}
d={d}
fill="none"
stroke={n.color}
strokeWidth={Math.max(0.8, 2.4 - n.depth * 0.25)}
opacity={opacityFor(n.depth) * 0.7}
/>
);
})}

{layout.visible.map((n) => {
const p = layout.pos[n.id];
if (!p) return null;
const r = radiusFor(n.depth);
const fs = fontFor(n.depth);
const op = opacityFor(n.depth);
const isLoading = loadingIds.has(n.id);
const isError = errorIds.has(n.id);
const hasChildren = (childrenMap[n.id] || []).length > 0;
const isCollapsed = collapsedIds.has(n.id);
return (
<g key={n.id} transform={`translate(${p.x},${p.y})`} onClick={() => expandNode(n.id)} style={{ cursor: "pointer" }}>
<rect x={-r - 4} y={-14} width={220} height={28} fill="transparent" />
{isLoading ? (
<circle r={r + 3} fill="none" stroke={AMBER} strokeWidth={1.2} opacity={0.8}>
<animate attributeName="r" values={`${r};${r + 8};${r}`} dur="1.1s" repeatCount="indefinite" />
<animate attributeName="opacity" values="0.8;0.1;0.8" dur="1.1s" repeatCount="indefinite" />
</circle>
) : null}
<circle
r={r}
fill={isError ? "#3a1f1f" : "#1A1D22"}
stroke={isError ? "#C4675C" : n.color}
strokeWidth={n.depth === 0 ? 2.4 : 1.4}
opacity={op}
/>
{!hasChildren && !isLoading ? (
<text x={0} y={r + 3.5} textAnchor="middle" fontSize={r > 5 ? 7 : 6} fill={n.color} opacity={0.9} style={{ pointerEvents: "none" }}>
+
</text>
) : null}
{hasChildren ? (
<text x={0} y={r + 3.5} textAnchor="middle" fontSize={7} fill={n.color} opacity={0.85} style={{ pointerEvents: "none" }}>
{isCollapsed ? "+" : "\u2212"}
</text>
) : null}
<text x={r + 8} y={n.note ? -1 : 3.5} fontSize={fs} fill="#EDEAE3" opacity={op} style={{ pointerEvents: "none" }}>
{n.label}
</text>
{n.note ? (
<text x={r + 8} y={11} fontSize={Math.max(7, fs - 2)} fill="#8A8781" fontStyle="italic" opacity={op * 0.85} style={{ pointerEvents: "none" }}>
{n.note}
</text>
) : null}
{isError ? (
<text x={r + 8} y={n.note ? 22 : 11} fontSize={8} fill="#C4675C" style={{ pointerEvents: "none" }}>
couldn't expand — tap to retry
</text>
) : null}
</g>
);
})}
</svg>
</div>

<div className="px-4 py-2.5 border-t border-[#2A2D33] flex items-center gap-2 text-[10px] text-[#8A8781]">
<Sparkles size={11} />
<span>Each tap asks Claude for the concept's next generation — try chasing a branch all the way down.</span>
</div>
</div>
);
}
