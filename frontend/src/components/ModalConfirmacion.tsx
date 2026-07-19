import { useState } from "react";
import Modal from "./Modal";

interface ModalConfirmacionProps {
  titulo: string;
  mensaje: string;
  motivoObligatorio?: boolean;
  motivoOpcional?: boolean;
  etiquetaBotonConfirmar?: string;
  peligro?: boolean;
  onCancelar: () => void;
  onConfirmar: (motivo: string | null) => void | Promise<void>;
}

export default function ModalConfirmacion({
  titulo,
  mensaje,
  motivoObligatorio,
  motivoOpcional,
  etiquetaBotonConfirmar = "Confirmar",
  peligro,
  onCancelar,
  onConfirmar,
}: ModalConfirmacionProps) {
  const [motivo, setMotivo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirmar() {
    if (motivoObligatorio && motivo.trim().length === 0) {
      setError("Debes indicar un motivo para continuar.");
      return;
    }
    setEnviando(true);
    setError(null);
    try {
      await onConfirmar(motivo.trim() || null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ocurrió un error.");
      setEnviando(false);
    }
  }

  return (
    <Modal titulo={titulo} onCerrar={onCancelar}>
      <p className="texto-suave">{mensaje}</p>
      {(motivoObligatorio || motivoOpcional) && (
        <div className="campo">
          <label htmlFor="modal-confirmacion-motivo">
            Motivo {motivoObligatorio ? "(obligatorio)" : "(opcional)"}
          </label>
          <textarea
            id="modal-confirmacion-motivo"
            rows={3}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
          />
        </div>
      )}
      {error && <p className="mensaje-error">{error}</p>}
      <div className="fila-acciones" style={{ justifyContent: "flex-end", marginTop: "1rem" }}>
        <button className="boton boton-secundario" onClick={onCancelar} disabled={enviando}>
          Cancelar
        </button>
        <button className={`boton ${peligro ? "boton-peligro" : "boton-primario"}`} onClick={confirmar} disabled={enviando}>
          {enviando ? "Procesando…" : etiquetaBotonConfirmar}
        </button>
      </div>
    </Modal>
  );
}
