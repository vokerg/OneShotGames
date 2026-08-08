#!/usr/bin/env node
"use strict";
const assert = require('assert');
require('./story-v2-core.js');require('./story-v2-horizon.js');require('./story-v2-endings.js');
const story=global.FE2_STORY_V2; const e=require('./logic-v2.js');
let s=e.initialState(story);
assert.equal(s.node,'boot');
s=e.applyEffects(story,s,{evidence:['route','bogus'],claims:['southFlights'],flags:['x'],rigor:2,heat:-3,trust:1,tracks:1});
assert.deepEqual(s.evidence,['route']); assert.deepEqual(s.claims,['southFlights']); assert.equal(s.rigor,2); assert.equal(s.heat,0);
assert(e.passes({...s,flags:['flightRouteDone','flightSkyDone']},{minIntroChecks:2}));
assert(!e.passes({...s,flags:['flightRouteDone']},{minIntroChecks:2}));
assert(e.puzzleAccepted({type:'numeric',min:760,max:820},'786'));
assert(e.puzzleAccepted({type:'numeric',min:7.2,max:7.2},'7,2'));
assert(e.puzzleAccepted({type:'text',answers:['НАБЛЮДЕНИЯ']},' наблюдения '));
const bad=e.sanitizeState(story,{node:'missing',evidence:'oops',claims:['missing'],flags:[1,'a','a'],rigor:'nan',heat:-9,visited:['boot','missing']});
assert.equal(bad.node,'boot'); assert.deepEqual(bad.evidence,[]); assert.deepEqual(bad.flags,['a']); assert.equal(bad.rigor,0); assert.equal(bad.heat,0); assert.deepEqual(bad.visited,['boot']);
const q=story.nodes.locker_test.quiz; const out=e.quizOutcome(story,e.initialState(story),q,'perfect'); assert(out.passed); assert(out.state.rigor>=4);
console.log('logic tests passed');
