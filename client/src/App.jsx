import { useRoom } from './useRoom.js';
import Landing from './components/Landing.jsx';
import Lobby from './components/Lobby.jsx';
import Table from './components/Table.jsx';
import GameOver from './components/GameOver.jsx';
import './styles/global.css';

export default function App() {
  const room = useRoom();
  const { state, error, connected } = room;

  // Bundle the action senders once for children.
  const actions = {
    createRoom: room.createRoom,
    joinRoom: room.joinRoom,
    leaveRoom: room.leaveRoom,
    updateSettings: room.updateSettings,
    takeSeat: room.takeSeat,
    leaveSeat: room.leaveSeat,
    addBot: room.addBot,
    removeBot: room.removeBot,
    startGame: room.startGame,
    act: room.act,
    followSeat: room.followSeat,
  };

  let screen;
  if (!state) {
    screen = <Landing onCreate={room.createRoom} onJoin={room.joinRoom} connected={connected} />;
  } else if (state.phase === 'lobby') {
    screen = <Lobby state={state} actions={actions} />;
  } else {
    screen = <Table state={state} actions={actions} />;
  }

  return (
    <>
      {screen}
      {state?.phase === 'ended' && <GameOver state={state} actions={actions} />}
      {/* Only nag about the connection once the user is actually in a room. */}
      {!connected && state && (
        <div className="conn-banner">
          <span className="conn-dot" /> Reconnecting…
        </div>
      )}
      {error && <div className="toast">{error}</div>}
    </>
  );
}
