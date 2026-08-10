#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  generateSupportVisualAtlas,
  SUPPORT_VISUAL_EXPECTED_UNIT_IDS,
  SUPPORT_VISUAL_REQUIRED_DIRECTIONS,
  SUPPORT_VISUAL_REQUIRED_FAMILIES,
  SUPPORT_VISUAL_REQUIRED_STATES,
  validateSupportVisualSource,
} from '../src/render/support-visual-atlas-generator.js';

export async function verifySupportVisuals(projectRoot){
  const path=resolve(projectRoot,'art-src/units/support/support-visual-source.json');
  const source=JSON.parse(await readFile(path,'utf8'));
  const errors=validateSupportVisualSource(source);if(errors.length)throw new Error(errors.join('\n'));
  const first=generateSupportVisualAtlas(source),second=generateSupportVisualAtlas(structuredClone(source));
  if(first.svg!==second.svg||JSON.stringify(first.manifestObject)!==JSON.stringify(second.manifestObject))throw new Error('support atlas generation is not deterministic');
  const stateFrames=SUPPORT_VISUAL_REQUIRED_STATES.reduce((total,state)=>total+source.states[state].frames,0);
  const expectedFrames=1+SUPPORT_VISUAL_EXPECTED_UNIT_IDS.length*(stateFrames*SUPPORT_VISUAL_REQUIRED_DIRECTIONS.length+2);
  if(first.frameCount!==expectedFrames)throw new Error(`support atlas frame count ${first.frameCount} != ${expectedFrames}`);
  if(first.animationCount!==SUPPORT_VISUAL_EXPECTED_UNIT_IDS.length*SUPPORT_VISUAL_REQUIRED_STATES.length)throw new Error('support atlas animation count is incomplete');
  for(const unitId of SUPPORT_VISUAL_EXPECTED_UNIT_IDS){
    if(!first.manifestObject.frames[`${unitId}.portrait`]||!first.manifestObject.frames[`${unitId}.icon`])throw new Error(`missing portrait/icon: ${unitId}`);
    for(const state of SUPPORT_VISUAL_REQUIRED_STATES){
      const animation=first.manifestObject.animations[`${unitId}.${state}`];
      if(!animation)throw new Error(`missing support animation: ${unitId}.${state}`);
      for(const direction of SUPPORT_VISUAL_REQUIRED_DIRECTIONS){
        if(animation.directions?.[direction]?.length!==source.states[state].frames)throw new Error(`invalid support animation frames: ${unitId}/${state}/${direction}`);
      }
    }
  }
  for(const faction of ['ukraine','russia'])for(const family of SUPPORT_VISUAL_REQUIRED_FAMILIES){
    if(!source.units.some((unit)=>unit.faction===faction&&unit.family===family))throw new Error(`${faction} missing ${family} visual coverage`);
  }
  if(!first.svg.startsWith('<svg')||!first.svg.includes('</svg>'))throw new Error('support atlas generator did not produce SVG');
  return Object.freeze({frameCount:first.frameCount,animationCount:first.animationCount,unitCount:source.units.length,familyCount:SUPPORT_VISUAL_REQUIRED_FAMILIES.length});
}

const invokedPath=process.argv[1]?resolve(process.argv[1]):null;
if(invokedPath===fileURLToPath(import.meta.url)){
  const projectRoot=resolve(dirname(fileURLToPath(import.meta.url)),'..');
  verifySupportVisuals(projectRoot)
    .then((result)=>console.log(`[support-visuals] verified ${result.unitCount} identities, ${result.frameCount} frames, ${result.animationCount} animations, ${result.familyCount} families`))
    .catch((error)=>{console.error(`[support-visuals] ${error.message}`);process.exitCode=1;});
}
