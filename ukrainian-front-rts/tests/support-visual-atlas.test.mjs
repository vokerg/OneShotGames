import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { UKRAINIAN_UAS_EW_PROFILE_IDS } from '../src/content/ukrainian-uas-ew-profiles.js';
import { UKRAINIAN_FIRES_PROFILE_IDS } from '../src/content/ukrainian-fires-profiles.js';
import { RUSSIAN_UAS_EW_FIRES_PROFILE_IDS } from '../src/content/russian-uas-ew-fires.js';
import { SUPPORT_PROFILE_IDS } from '../src/content/shared-support-systems.js';
import {
  generateSupportVisualAtlas,
  SUPPORT_VISUAL_EXPECTED_UNIT_IDS,
  SUPPORT_VISUAL_REQUIRED_DIRECTIONS,
  SUPPORT_VISUAL_REQUIRED_FAMILIES,
  SUPPORT_VISUAL_REQUIRED_STATES,
  validateSupportVisualSource,
} from '../src/render/support-visual-atlas-generator.js';
import {
  resolveSupportVisualUnitId,
  supportVisualAnimationId,
  supportVisualDirectionFromAngle,
  supportVisualFactionPrefix,
  supportVisualStateForEntity,
} from '../src/render/support-visual-atlas.js';
import { installSupportVisualArtPass } from '../src/render/support-visual-art-pass.js';

const source=JSON.parse(await readFile(new URL('../art-src/units/support/support-visual-source.json',import.meta.url),'utf8'));
const canonicalContentIds=[...UKRAINIAN_UAS_EW_PROFILE_IDS,...UKRAINIAN_FIRES_PROFILE_IDS,...SUPPORT_PROFILE_IDS,...RUSSIAN_UAS_EW_FIRES_PROFILE_IDS].sort();
const stateFrameTotal=SUPPORT_VISUAL_REQUIRED_STATES.reduce((total,state)=>total+source.states[state].frames,0);
const expectedFrameCount=1+source.units.length*(stateFrameTotal*SUPPORT_VISUAL_REQUIRED_DIRECTIONS.length+2);

test('support source is an exact visual projection of UFR-073/074/077/078 canonical profiles',()=>{
  assert.deepEqual(validateSupportVisualSource(source),[]);
  assert.deepEqual([...SUPPORT_VISUAL_EXPECTED_UNIT_IDS].sort(),canonicalContentIds);
  assert.deepEqual(source.units.map((unit)=>unit.id).sort(),canonicalContentIds);
  assert.equal(source.units.length,32);
  for(const faction of ['ukraine','russia']){
    const families=new Set(source.units.filter((unit)=>unit.faction===faction).map((unit)=>unit.family));
    assert.deepEqual([...families].sort(),[...SUPPORT_VISUAL_REQUIRED_FAMILIES].sort());
  }
  assert.equal(new Set(source.units.map((unit)=>unit.profile)).size>=20,true,'role-distinct profiles must not collapse into family placeholders');
});

test('support atlas covers seven lifecycle states, eight facings, portraits and icons for every identity',()=>{
  const atlas=generateSupportVisualAtlas(source);
  assert.equal(atlas.frameCount,expectedFrameCount);
  assert.equal(atlas.animationCount,source.units.length*SUPPORT_VISUAL_REQUIRED_STATES.length);
  assert.equal(Object.keys(atlas.manifestObject.frames).length,expectedFrameCount);
  assert.equal(Object.keys(atlas.manifestObject.animations).length,source.units.length*SUPPORT_VISUAL_REQUIRED_STATES.length);
  for(const unit of source.units){
    assert.ok(atlas.manifestObject.frames[`${unit.id}.portrait`],`${unit.id} portrait`);
    assert.ok(atlas.manifestObject.frames[`${unit.id}.icon`],`${unit.id} icon`);
    for(const state of SUPPORT_VISUAL_REQUIRED_STATES){
      const animation=atlas.manifestObject.animations[`${unit.id}.${state}`];
      assert.ok(animation,`${unit.id}/${state}`);
      for(const direction of SUPPORT_VISUAL_REQUIRED_DIRECTIONS){
        assert.equal(animation.directions[direction].length,source.states[state].frames,`${unit.id}/${state}/${direction}`);
      }
    }
  }
  assert.ok(atlas.svg.includes('UFR-114 support atlas'));
  assert.equal(atlas.catalogObject.counts.units,32);
});

test('support visual generation is byte deterministic',()=>{
  const a=generateSupportVisualAtlas(source);
  const b=generateSupportVisualAtlas(structuredClone(source));
  assert.equal(a.svg,b.svg);
  assert.deepEqual(a.manifestObject,b.manifestObject);
  assert.deepEqual(a.catalogObject,b.catalogObject);
});

test('runtime resolution is canonical and does not steal unrelated renderer ownership',()=>{
  assert.equal(resolveSupportVisualUnitId('uaDrone',{visual:'quadDrone'}),'ua.recon-drone.fpv-strike');
  assert.equal(resolveSupportVisualUnitId('ruArtillery',{visual:'msta'}),'ru.self-propelled-gun');
  assert.equal(resolveSupportVisualUnitId('ua.support.mobile-bridge',{}),'ua.support.mobile-bridge');
  assert.equal(resolveSupportVisualUnitId('uaInfantry',{role:'support infantry',faction:'ukraine'}),null);
  assert.equal(resolveSupportVisualUnitId('ruTank',{archetype:'artillery',faction:'russia'}),null);
  assert.equal(supportVisualFactionPrefix({type:'uaDrone',team:0},{visual:'quadDrone'}),'ua');
  assert.equal(supportVisualStateForEntity({wreck:true,hp:0,maxHp:100}),'wreck');
  assert.equal(supportVisualStateForEntity({dying:true,hp:0,maxHp:100}),'death');
  assert.equal(supportVisualStateForEntity({hitFlash:true,hp:80,maxHp:100}),'hit');
  assert.equal(supportVisualStateForEntity({hp:40,maxHp:100}),'damaged');
  assert.equal(supportVisualStateForEntity({hp:100,maxHp:100,flash:.1}),'attack');
  assert.equal(supportVisualStateForEntity({hp:100,maxHp:100,order:{kind:'move'}}),'move');
  assert.equal(supportVisualDirectionFromAngle(-Math.PI/2),'n');
  assert.equal(supportVisualAnimationId('uaDrone','death'),'ua.recon-drone.fpv-strike.death');
});

test('support renderer pass composes with fallback and restores ownership cleanly',async()=>{
  const draws=[];
  const runtime={manifest:{animations:{'ua.recon-drone.fpv-strike.idle':{}}},drawAnimation(...args){draws.push(args);return{frameId:'ok'};}};
  class Renderer{
    constructor(){this.g={camera:{z:1},time:1,unitStats:(type)=>type==='uaDrone'?{visual:'quadDrone',size:10}:null};this.x={};this.selections=0;}
    unit(entity){return `fallback:${entity.type}`;}
    sp(){return{x:100,y:100};}
    selection(){this.selections+=1;}
  }
  const fallback=Renderer.prototype.unit;
  const installation=installSupportVisualArtPass(Renderer,{loadAtlas:async()=>runtime});
  await new Promise((resolve)=>setTimeout(resolve,0));
  const renderer=new Renderer();
  assert.equal(renderer.unit({type:'uaInfantry',x:0,y:0,angle:0}),'fallback:uaInfantry');
  assert.deepEqual(renderer.unit({type:'uaDrone',x:0,y:0,angle:-Math.PI/2,hp:50,maxHp:50}),{frameId:'ok'});
  assert.equal(draws.length,1);
  assert.equal(draws[0][1],'ua.recon-drone.fpv-strike.idle');
  assert.equal(renderer.selections,1);
  installation.restore();
  assert.equal(Renderer.prototype.unit,fallback);
});

test('support validation fails closed on dependency drift, lifecycle drift and provenance gaps',()=>{
  const missing=structuredClone(source);missing.units=missing.units.filter((unit)=>unit.id!=='ru.sam-battery');
  assert.match(validateSupportVisualSource(missing).join('\n'),/missing canonical support visual identity: ru\.sam-battery/);
  const extra=structuredClone(source);extra.units.push({...extra.units[0],id:'ua.unowned-support'});
  assert.match(validateSupportVisualSource(extra).join('\n'),/unexpected support visual identity: ua\.unowned-support/);
  const lifecycle=structuredClone(source);delete lifecycle.states.death;
  assert.match(validateSupportVisualSource(lifecycle).join('\n'),/missing state definition: death/);
  const provenance=structuredClone(source);provenance.provenance.license='';
  assert.match(validateSupportVisualSource(provenance).join('\n'),/missing provenance\.license/);
});
