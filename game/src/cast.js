// The cast of Vista Mar. Every named character in the story lives here with a role, a
// one-line bio and the colour the HUD paints their name in, so the dialogue box, the
// mission briefs and the title screen all agree about who is talking.
//
// VISTA MAR is a Florida-Keys city in 1986: a neon promenade, a glass downtown, a marina
// full of freight nobody declares. The story is a three-way squeeze:
//   MARISOL "SOL" VEGA  — the protagonist, a wheelman just out of county lock-up
//   SAL DUARTE          — the fixer who hands out the work, owns the Avenida Costa motel
//   DET. IVY ROURKE     — the rival, Sal's old partner, now running freight for the cartel
//   CAPT. HECTOR BRISCO — VCPD commander, taunts the player over the radio at 4-5 stars
//   NICO "TINY" ALVAREZ — the crew's wheelman-of-last-resort and Sol's cousin
//   DELIA ORTEGA        — the crew's lookout, runs the marina chandlery
//
// The antagonist arc: Rourke sold Sol out years ago and is using his marina to move the
// cartel's money. She frames Sol for the harbour killing, and the last job is the crew
// taking the money back out from under her — which resolves the arc at mission 5.

export const PROTAGONIST_ID = 'sol';

export const CAST = {
  sol: {
    id: 'sol',
    name: 'MARISOL "SOL" VEGA',
    short: 'SOL',
    role: 'protagonist',
    colour: '#45f0ff',
    bio: 'Wheelman. Three years in county for a job she did not drive. Back on the Avenida with nothing but a licence and a grudge.',
    lines: {
      intro: 'Three years, and the Avenida still smells the same. Sal is not going to like my face.',
    },
  },
  sal: {
    id: 'sal',
    name: 'SAL DUARTE',
    short: 'SAL',
    role: 'fixer',
    colour: '#ffd166',
    bio: 'Runs the Vista Mar Motel and every job on the strip. Keeps his ledger in his head and his debts in other people\'s names.',
    lines: {
      greeting: 'Fresh off the bus. Sal runs this stretch of the Avenida — talk to me when you want work.',
      return: 'Back for more? Vista Mar never forgets a face.',
      arcWarn: 'Rourke is moving freight through my marina again. That is my name on those crates, Sol.',
    },
  },
  rourke: {
    id: 'rourke',
    name: 'DET. IVY ROURKE',
    short: 'ROURKE',
    role: 'rival',
    colour: '#ff3d8b',
    bio: 'Sal\'s old partner, now a detective working freight for the cartel out of Caleta Marina. Sold Sol out once; plans to do it again.',
    lines: {
      reveal: 'You think Sal gave you that job out of kindness? I put you in county, and I can put you back.',
      taunt: 'Still driving other people\'s cars, Vega? Some things never change.',
      final: 'That money is mine. Every crate in that marina is mine.',
    },
  },
  brisco: {
    id: 'brisco',
    name: 'CAPT. HECTOR BRISCO',
    short: 'BRISCO',
    role: 'police-captain',
    colour: '#5b86ff',
    bio: 'VCPD commander. Believes Vista Mar is one bad night from becoming Miami and blames Sol for most of them.',
    lines: {
      l4: 'Vega. You have got four stars and a helicopter. Do the math and pull over.',
      l4b: 'I own every bridge off this island, Vega. You are not going anywhere.',
      l5: 'Roadblocks on every avenue. You wanted the whole department? You have got it.',
      l5b: 'This is Captain Brisco. Put it in a ditch and I will let you keep your teeth.',
      lost: 'She is off the board. Find her. Find her NOW.',
    },
  },
  tiny: {
    id: 'tiny',
    name: 'NICO "TINY" ALVAREZ',
    short: 'TINY',
    role: 'crew',
    colour: '#3ddc84',
    bio: 'Sol\'s cousin. Six-foot-four, drives a tow truck, cries at weddings. The crew\'s only real friend.',
    lines: {
      greet: 'Cousin! You look like county chewed you up and spat you on the sand.',
      race: 'Van\'s loaded. If you beat me to Punta Norte I will buy the beer.',
    },
  },
  delia: {
    id: 'delia',
    name: 'DELIA ORTEGA',
    short: 'DELIA',
    role: 'crew',
    colour: '#ff8c42',
    bio: 'Runs the marina chandlery and the crew\'s lookout rota. Counts trucks for a living and remembers every plate.',
    lines: {
      heist: 'Twelve crates, two guards, one window. I marked the roof for you.',
      count: 'Three vans went in. Only one came out. That is Rourke\'s arithmetic.',
    },
  },
};

export const CAST_LIST = Object.values(CAST);

/** Look a speaker up by id, falling back to a plain name object. */
export function castMember(id) {
  return CAST[id] ?? { id, name: String(id ?? 'UNKNOWN').toUpperCase(), short: String(id ?? '?').toUpperCase(), colour: '#45f0ff', role: 'extra', bio: '', lines: {} };
}

/** The name shown in the dialogue box for a speaker id. */
export function speakerName(id) {
  const c = castMember(id);
  return c.short ?? c.name;
}

/** Line delivery helper: [{speaker, text}, ...] used by missions and the title screen. */
export function lines(...pairs) {
  return pairs.map(([speaker, text]) => ({ speaker, name: speakerName(speaker), text, colour: castMember(speaker).colour }));
}