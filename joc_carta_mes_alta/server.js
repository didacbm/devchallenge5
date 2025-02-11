const WebSocket = require('ws');
const http = require('http'); // Necessitem un servidor HTTP per Railway

// Creem un servidor HTTP bàsic
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Servidor WebSocket actiu\n');
});

// Creem el servidor WebSocket utilitzant el servidor HTTP
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
    console.log(`Servidor WebSocket escoltant al port ${PORT}`);
});
// Objecte per gestionar les sales de joc
let sales = {}; // Exemple: { "AB123": { jugador1: {...}, jugador2: {...}, baralla: [...], marcador: { jugador1: 0, jugador2: 0 } } }

// Funció per generar un codi de sala únic
function generarCodiSala() {
    return Math.random().toString(36).substring(2, 7).toUpperCase();
}

// Funció per generar una baralla de cartes
function generarBaralla() {
    const pals = ['C', 'D', 'P', 'T']; // Cors, Diamants, Piques, Trèvols
    const valors = [2, 3, 4, 5, 6, 7, 8, 9, 10, 'J', 'Q', 'K', 'A'];
    const baralla = [];
    pals.forEach(pal => {
        valors.forEach(valor => {
            baralla.push({ valor, pal });
        });
    });
    return baralla.sort(() => Math.random() - 0.5);
}

// Funció per repartir cartes dins d'una sala
function repartirCartes(codiSala) {
    const sala = sales[codiSala];
    if (!sala) return;

    sala.jugador1.cartes = sala.baralla.splice(0, 5);
    sala.jugador2.cartes = sala.baralla.splice(0, 5);
}

// Quan un jugador es connecta
wss.on('connection', (ws) => {
    console.log('Un jugador s\'ha connectat.');

    ws.on('message', (message) => {
        const data = JSON.parse(message);

        if (data.type === 'crearSala') {
            const codiSala = generarCodiSala();
            sales[codiSala] = {
                baralla: generarBaralla(),
                marcador: { jugador1: 0, jugador2: 0 }, // Afegim el marcador per la sala
                jugador1: { ws, cartes: [], seleccionada: null },
                jugador2: null
            };
            ws.send(JSON.stringify({ type: 'salaCreada', codi: codiSala }));
        }

        if (data.type === 'unirSala') {
            const codiSala = data.codiSala;
            if (!sales[codiSala]) {
                ws.send(JSON.stringify({ type: 'error', message: 'La sala no existeix' }));
                return;
            }

            if (sales[codiSala].jugador2) {
                ws.send(JSON.stringify({ type: 'error', message: 'La sala està plena' }));
                return;
            }

            sales[codiSala].jugador2 = { ws, cartes: [], seleccionada: null };

            repartirCartes(codiSala);

            [sales[codiSala].jugador1.ws, sales[codiSala].jugador2.ws].forEach(client => {
                client.send(JSON.stringify({
                    type: 'iniciarPartida',
                    codiSala,
                    cartes: client === sales[codiSala].jugador1.ws 
                        ? sales[codiSala].jugador1.cartes 
                        : sales[codiSala].jugador2.cartes
                }));
            });
        }

        if (data.type === 'seleccionarCarta') {
            const codiSala = data.codiSala;
            if (!sales[codiSala]) return;

            const jugador = data.jugador;
            sales[codiSala][jugador].seleccionada = sales[codiSala][jugador].cartes[data.index];

            if (sales[codiSala].jugador1.seleccionada && sales[codiSala].jugador2.seleccionada) {
                const resultat = determinarGuanyador(
                    sales[codiSala].jugador1.seleccionada, 
                    sales[codiSala].jugador2.seleccionada
                );

                if (resultat !== "empat") {
                    sales[codiSala].marcador[resultat]++; // Incrementem marcador
                }

                [sales[codiSala].jugador1.ws, sales[codiSala].jugador2.ws].forEach(client => {
                    client.send(JSON.stringify({
                        type: 'resultat',
                        codiSala,
                        marcador: sales[codiSala].marcador, // Enviar marcador actualitzat
                        jugador1: sales[codiSala].jugador1.seleccionada,
                        jugador2: sales[codiSala].jugador2.seleccionada,
                        guanyador: resultat
                    }));
                });

                sales[codiSala].jugador1.seleccionada = null;
                sales[codiSala].jugador2.seleccionada = null;
            }
        }
    });

    ws.on('close', () => {
        console.log('Un jugador s\'ha desconnectat.');
        for (const codiSala in sales) {
            if (sales[codiSala].jugador1?.ws === ws) {
                sales[codiSala].jugador1 = null;
            }
            if (sales[codiSala].jugador2?.ws === ws) {
                sales[codiSala].jugador2 = null;
            }
            if (!sales[codiSala].jugador1 && !sales[codiSala].jugador2) {
                delete sales[codiSala]; // Elimina la sala si està buida
            }
        }
    });
});

function determinarGuanyador(carta1, carta2) {
    const valors = { 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 7: 7, 8: 8, 9: 9, 10: 10, J: 11, Q: 12, K: 13, A: 14 };
    const valor1 = valors[carta1.valor];
    const valor2 = valors[carta2.valor];

    if (valor1 > valor2) return 'jugador1';
    if (valor2 > valor1) return 'jugador2';
    return 'empat';
}
