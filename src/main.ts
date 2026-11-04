import './ui/style.css';
import { startGame } from './game/game';

const canvas = document.querySelector<HTMLCanvasElement>('#game');
const hud = document.querySelector<HTMLElement>('#hud');

if (canvas && hud) {
  startGame(canvas, hud).catch((err: unknown) => {
    console.error(err);
    hud.textContent = 'The Spire could not awaken. Please reload the page.';
  });
}
