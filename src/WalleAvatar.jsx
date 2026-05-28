// Composant statique Wall-E - affiche l'image UNIT-01 a la place de l'ancien JarvisOrb
// Drop-in compatible avec JarvisOrb : memes props (state, size)
// La prop state n'est pas utilisee visuellement (pas d'animation par choix) - gardee pour compatibilite future
// L'image est servie depuis /walle.png (place dans le dossier public/ a la racine du projet)

function WalleAvatar({ state = 'idle', size = 180 }) {
  return (
    <div
      className="walle-avatar"
      style={{
        width: size,
        height: size,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0
      }}
    >
      <img
        src="/walle.png"
        alt="Wall-E"
        draggable={false}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'contain',
          userSelect: 'none',
          pointerEvents: 'none'
        }}
      />
    </div>
  )
}

export default WalleAvatar
