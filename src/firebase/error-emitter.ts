
import { EventEmitter } from 'events';

// This is a simple event emitter that will be used to propagate
// Firebase permission errors to a listener component.
export const errorEmitter = new EventEmitter();
