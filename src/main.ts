import './ui/style.css';
import { createScene } from './game/scene';

const canvas = document.querySelector<HTMLCanvasElement>('#game');
if (!canvas) throw new Error('Missing #game canvas');

createScene(canvas).start();
