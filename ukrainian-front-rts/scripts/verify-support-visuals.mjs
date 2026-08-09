#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateSupportVisualAtlas, SUPPORT_VISUAL_REQUIRED_DIRECTIONS, SUPPORT_VISUAL_REQUIRED_FAMILIES, SUPPORT_VISUAL_REQUIRED_STATES, validateSupportVisualSource } from '../src/render/support-visual-atlas-generator.js';

export async function verifySupportVisuals(projectRoot){
  const path=resolve(projectRoot,'art-src/units/support/support-visual-source.json');
  const source=JSON.parse(await readFile(path,'utf8'));
  const errors=validateSupportVisualSource(source);if(errors.length)throw new Error(errors.join('\n'));
  const atlas=generateSupportVisualAtlas(source);
  const expected=2*SUPPORT_VISUAL_REQUIRED_FAMILIES.length*SUPPORT_VISUAL_REQUIRED_DIRECTIONS.length*SUPPORT_VISUAL_REQUIRED_STATES.length;
  if(atlas.frameCount!==expected)throw new Error(`support atlas frame count ${atlas.frameCount} != ${expected}`);
  for(const faction of ['ua','ru'])for(const family of SUPPORT_VISUAL_REQUIRED_FAMILIES)for(const state of SUPPORT_VISUAL_REQUIRED_STATES)for(const direction of SUPPORT_VISUAL_REQUIRED_DIRECTIONS){
    const id=`${faction}.${family}.${state}.${direction}`;
    if(!atlas.frames.some((frame)=>frame.id===id))throw new Error(`missing support visual frame: ${id}`);
  }
  if(!atlas.svg.startsWith('<svg')||!atlas.svg.includes('</svg>'))throw new Error('support atlas generator did not produce SVG');
  return Object.freeze({frameCount:atlas.frameCount,familyCount:SUPPORT_VISUAL_REQUIRED_FAMILIES.length,factionCount:2});
}

const invokedPath=process.argv[1]?resolve(process.argv[1]):null;
if(invokedPath===fileURLToPath(import.meta.url)){
 const projectRoot=resolve(dirname(fileURLToPath(import.meta.url)),'..');
 verifySupportVisuals(projectRoot).then((r)=>console.log(`[support-visuals] verified ${r.frameCount} frames, ${r.familyCount} families, ${r.factionCount} factions`)).catch((error)=>{console.error(`[support-visuals] ${error.message}`);process.exitCode=1;});
}
