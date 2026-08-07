#!/usr/bin/env node
"use strict";

const story = require("./story.js");

const errors = [];
const nodes = story.nodes || {};
const ids = new Set(Object.keys(nodes));

for (const [id, node] of Object.entries(nodes)) {
  if (!node.title) errors.push(`${id}: missing title`);
  if (!node.chapter) errors.push(`${id}: missing chapter`);
  if (!Array.isArray(node.lines) || !node.lines.length) errors.push(`${id}: missing lines`);

  for (const choice of node.choices || []) {
    if (!choice.label) errors.push(`${id}: choice missing label`);
    if (!ids.has(choice.next)) errors.push(`${id}: choice points to missing node ${choice.next}`);
  }

  if (node.puzzle) {
    if (!Array.isArray(node.puzzle.answers) || !node.puzzle.answers.length) errors.push(`${id}: puzzle has no answers`);
    if (!ids.has(node.puzzle.success)) errors.push(`${id}: puzzle success points to missing node ${node.puzzle.success}`);
  }
}

const evidenceIds = new Set(Object.keys(story.evidence || {}));
for (const [id, node] of Object.entries(nodes)) {
  for (const choice of node.choices || []) {
    for (const evidence of choice.effects?.evidence || []) {
      if (!evidenceIds.has(evidence)) errors.push(`${id}: unknown evidence ${evidence}`);
    }
  }
  for (const evidence of node.puzzle?.effects?.evidence || []) {
    if (!evidenceIds.has(evidence)) errors.push(`${id}: puzzle references unknown evidence ${evidence}`);
  }
}

const endingCount = Object.values(nodes).filter((node) => node.ending).length;
if (endingCount < 3) errors.push(`expected at least 3 endings, found ${endingCount}`);

if (errors.length) {
  console.error("Story verification failed:");
  for (const error of errors) console.error(` - ${error}`);
  process.exit(1);
}

console.log(`Story verification passed: ${ids.size} nodes, ${endingCount} endings, ${evidenceIds.size} evidence types.`);
