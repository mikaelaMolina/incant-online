import type { VoiceError } from '../voice/recognizers';
import type { VoiceMode } from '../voice/speechInput';

/** In-character lines for voice problems. Raw browser errors are never shown to the player. */
export function voiceErrorMessage(error: VoiceError, mode: VoiceMode): string {
  switch (error) {
    case 'not-allowed':
      return 'The Spire cannot hear you: microphone access is blocked. Allow it from the address bar, or type below.';
    case 'no-speech':
      return 'The Spire heard only silence. Hold V while you speak, then let go.';
    case 'audio-capture':
      return 'No microphone answers the call. Connect one, or type below.';
    case 'network':
      return mode === 'recorder'
        ? 'Your browser’s ear has failed; the Spire will listen another way. Hold V and speak again.'
        : 'Your words were lost on the way. Hold V and speak again, or type below.';
    case 'unavailable':
      return 'The Spire’s ear is closed for now. Type your words below.';
  }
}

export const NO_VOICE_MESSAGE = 'This browser cannot carry your voice. Type below, or use Chrome or Edge to speak.';
