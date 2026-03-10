type NameChangeRequestDialogProps = {
  isOpen: boolean;
  nameInput: string;
  isSubmitting: boolean;
  onChangeNameInput: (value: string) => void;
  onSubmit: () => void;
  onClose: () => void;
};

export function NameChangeRequestDialog({
  isOpen,
  nameInput,
  isSubmitting,
  onChangeNameInput,
  onSubmit,
  onClose
}: NameChangeRequestDialogProps) {
  if (!isOpen) {
    return null;
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="name-change-title">
        <h2 id="name-change-title">Request Name Change</h2>
        <form
          className="modal-form"
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit();
          }}
        >
          <label className="month-picker" htmlFor="name-change-name-input">
            New Name
            <input
              id="name-change-name-input"
              type="text"
              value={nameInput}
              onChange={(event) => onChangeNameInput(event.target.value)}
              autoComplete="nickname"
              spellCheck={false}
              placeholder="Your requested name"
              maxLength={64}
            />
          </label>
          <div className="modal-actions">
            <button type="submit" className="primary-button" disabled={isSubmitting}>
              {isSubmitting ? 'Requesting...' : 'Submit Request'}
            </button>
            <button type="button" className="ghost-button" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
