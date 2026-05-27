import { caCd001 } from './ca-cd001.js'
import { caDocs001 } from './ca-docs001.js'
import { caDocs002 } from './ca-docs002.js'
import { caDocs003 } from './ca-docs003.js'
import { caCi001 } from './ca-ci001.js'
import { caCi003 } from './ca-ci003.js'
import { caDocker001 } from './ca-docker001.js'
import { caDocker002 } from './ca-docker002.js'
import { caPkg001 } from './ca-pkg001.js'
import { caPkg002 } from './ca-pkg002.js'
import { caLock001 } from './ca-lock001.js'
import { caTest001 } from './ca-test001.js'
import { caTest002 } from './ca-test002.js'
import { caOwn001 } from './ca-own001.js'
import { caTodo003 } from './ca-todo003.js'
import type { Rule } from '../engine.js'

export const allRules: Rule[] = [
  caCd001,
  caDocs001,
  caDocs002,
  caDocs003,
  caCi001,
  caCi003,
  caDocker001,
  caDocker002,
  caPkg001,
  caPkg002,
  caLock001,
  caTest001,
  caTest002,
  caOwn001,
  caTodo003,
]
