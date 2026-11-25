import QRCode from 'qrcode'
import { useEffect, useState } from 'react'

/**
 * Dibujo del QR como SVG, para que se imprima nítido a cualquier tamaño. Corrección de errores
 * "Q" (25%): la etiqueta se ensucia con polvo de zirconio y se despega en los bordes.
 */
export function CodigoQR({ texto, className, titulo }: { texto: string; className?: string; titulo: string }) {
  const [svg, setSvg] = useState('')
  useEffect(() => {
    let vigente = true
    QRCode.toString(texto, { type: 'svg', errorCorrectionLevel: 'Q', margin: 1, color: { dark: '#000000', light: '#ffffff' } }).then((s) => {
      if (vigente) setSvg(s)
    })
    return () => {
      vigente = false
    }
  }, [texto])
  return <div role="img" aria-label={titulo} className={className} dangerouslySetInnerHTML={{ __html: svg }} />
}
