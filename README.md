# Ateliê de Calendários — Grace Fotografia

Editor de calendário anual personalizado, em português, feito em HTML, CSS e JavaScript. Funciona localmente no navegador, sem servidor.

## Para usar

1. Em [Releases](https://github.com/RafaelRodriguesDev/calendarioCustomizavel/releases), baixe o arquivo ZIP mais recente e extraia tudo.
2. Abra o arquivo `index.html` no Chrome ou Edge.
3. Escolha o ano: os 12 meses e dias da semana são calculados automaticamente (inclusive anos bissextos).
4. Em **Foto**, carregue a fotografia e ajuste o enquadramento.
5. Em **Elementos**, solte uma imagem com vários adornos. O editor tenta remover o fundo branco, transparente ou da cor escolhida, separar as peças e mostrar miniaturas. Arraste uma miniatura diretamente para o calendário.
6. Exporte em PNG/PDF A4 ou A3, com opção de 300 DPI. Salve o projeto em JSON se quiser continuar depois.

Fotografias de clientes não são enviadas para servidores: o processamento ocorre no navegador. Adornos muito próximos ou encostados podem ser detectados como um único objeto.

## Organização dos arquivos
- `index.html`: interface
- `styles.css`: aparência
- `app.js`: editor e calendário
- `sprites.js`: recorte e detecção de elementos
- `export.js`: exportação offline para PNG e PDF
- `assets/`: recursos demonstrativos
- `.github/workflows/release.yml`: geração automática do ZIP no GitHub Releases

Ao atualizar a branch `main`, o GitHub Actions publica uma nova versão em Releases.

## Novidades do editor visual

- Selecione um elemento no calendário para abrir o painel de edição à direita.
- Arraste as alças para redimensionar e use Delete/Ctrl+C/Ctrl+X/Ctrl+V.
- Desfaça ou refaça até 40 alterações (Ctrl+Z, Ctrl+Y).
- Rascunho salvo automaticamente no navegador; **Salvar projeto** baixa o arquivo JSON completo para guardar ou continuar em outro dispositivo.
- Ao importar sprite sheets, confira as miniaturas na janela de prévia, ajuste o fundo e clique em **Separar elementos** antes de salvar na biblioteca.

O armazenamento local do navegador pode ser apagado nas configurações. Para cópia permanente, guarde o JSON baixado.
