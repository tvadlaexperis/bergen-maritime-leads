// Read-only — editing happens through the "Oppdater info" admin popup
// (AdminControls), not here, so there's only ever one place notes get saved.
export default function NotesBox({ notes }: { notes: string }) {
  return (
    <div className="box">
      <div className="box-header"><span className="box-title">Notater</span></div>
      <div className="box-pad">
        {notes ? (
          <p style={{ whiteSpace: 'pre-line' }}>{notes}</p>
        ) : (
          <p className="muted" style={{ fontSize: '0.85rem' }}>Ingen notater ennå.</p>
        )}
      </div>
    </div>
  );
}
