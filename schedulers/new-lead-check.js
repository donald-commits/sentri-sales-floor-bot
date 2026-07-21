const { EmbedBuilder } = require('discord.js');
const notionStats = require('../services/notion-stats');
const { getActiveAgents } = require('../utils/agent-store');

const DM_MESSAGES = [
  "You've got new leads sitting untouched. That's money rotting on the vine.",
  "Every minute those leads sit is a minute your competition is calling them.",
  "Those new leads aren't going to close themselves. Pick up the phone.",
  "You have leads aging out while you're doing what exactly?",
  "Someone else would kill for those leads. Are you going to work them or not?",
  "New leads = new money. Why are you letting money sit?",
  "Those leads were hot when they came in. Now they're getting cold. Move.",
  "You're sitting on gold and acting like it's dirt. Call those leads.",
  "The top closers in this company don't let leads sit. Neither should you.",
  "Your lead queue is backing up. That's not a good look.",
  "I can see your new leads from here. So can everyone else. Handle it.",
  "Those leads cost money to generate. Don't waste the company's investment.",
  "Speed to lead wins deals. You're losing that race right now.",
  "If you don't want those leads, I'll give them to someone who does.",
  "Every lead sitting in your name is a promise you haven't kept yet.",
  "The clock is ticking on those new leads. First to call wins.",
  "You've got leads stacking up. That tells me you're not working hard enough.",
  "New leads are a gift. Stop leaving gifts unopened.",
  "Your pipeline is clogged because you won't clear the top of the funnel.",
  "I didn't assign you leads so they could collect dust.",
  "Those new leads have been waiting. They won't wait forever.",
  "Someone is going to close those homeowners. Is it you or your competitor?",
  "Stop cherry-picking and start dialing. Every lead deserves a call.",
  "If a lead sits more than a day, you've already lost the advantage.",
  "Your new lead count should be going DOWN, not staying the same.",
  "The best salespeople attack new leads like their rent depends on it. Because it does.",
  "Those leads represent real people waiting for help. Get on it.",
  "You can't close what you don't call. Start calling.",
  "Your conversion rate means nothing if you're not even contacting people.",
  "I see new leads in your name. I don't see outreach. Fix that.",
  "This isn't a suggestion. Clear your new leads today.",
  "Speed. To. Lead. Three words that should be tattooed on your brain.",
  "You're leaving commission on the table every hour those leads sit.",
  "The difference between top performers and everyone else? They call first.",
  "New leads are perishable. Treat them like it.",
  "Your lead queue looks like a waiting room. Empty it.",
  "Those leads were assigned to you because I thought you'd work them. Prove me right.",
  "A lead that sits is a lead that dies. Don't let them die.",
  "You've got people who need roofing work and you're letting them wait? Come on.",
  "Every new lead is an appointment waiting to happen. Make it happen.",
  "I'm looking at your new leads right now and I'm not happy about it.",
  "The sales floor doesn't sleep. Neither should your follow-up game.",
  "Your leads are getting colder by the hour. That's on you.",
  "Top producers clear new leads the same day. What's your excuse?",
  "You want bigger commission checks? Start by calling every single new lead.",
  "New leads sit = money slips. It's that simple.",
  "I shouldn't have to tell you to call your leads. That's literally your job.",
  "Those homeowners filled out a form because they need help NOW. Call them NOW.",
  "Your new lead count is embarrassing. Let's fix that today.",
  "If those leads were $100 bills on the ground, would you leave them there?",
  "The phone isn't going to pick itself up. Let's go.",
  "Are you a closer or a collector? Closers don't hoard leads.",
  "Your pipeline starts with those new leads. No calls = no pipeline.",
  "I need those leads contacted and I need it done yesterday.",
  "You're sitting on opportunity and watching it expire. That's not the move.",
  "The leaderboard doesn't lie. Neither does your untouched lead count.",
  "Every lead you don't call is a deal you're handing to someone else.",
  "You have new leads aging in your queue. That's unacceptable.",
  "Get on the phone. Get through those leads. Get paid. In that order.",
  "Your lead response time is showing. And it's not showing well.",
  "You want to be number one? Start by being first to call every lead.",
  "Leads don't stay new forever. They become someone else's closed deal.",
  "I'm giving you leads because I believe in you. Don't make me reconsider.",
  "Those leads are screaming for attention. Answer the call.",
  "You're one phone call away from your next deal. Make it.",
  "A stacked lead queue means stacked excuses. I don't want excuses.",
  "Clear your leads or I'll clear them for you. Your choice.",
  "The best time to call a new lead was yesterday. The next best time is right now.",
  "Your competitors are calling leads within 5 minutes. What are you doing?",
  "I handed you opportunities. Not decorations for your dashboard.",
  "New leads in your name and no activity? We need to talk.",
  "You're running a business, not a museum. Those leads aren't exhibits.",
  "You have homeowners ready to spend money and you're making them wait.",
  "Every uncalled lead is a 1-star review waiting to happen. Call them.",
  "I see your lead count. I see your call count. The math isn't mathing.",
  "Pick up the phone, clear those leads, and then come talk to me about results.",
  "If your leads could talk, they'd be asking why you ghosted them.",
  "You've been assigned these leads for a reason. The reason is to CALL THEM.",
  "A full lead queue and an empty call log is a recipe for a bad conversation with me.",
  "Your new leads are your paycheck. Why are you ignoring your paycheck?",
  "First contact wins 78% of the time. Be the first contact.",
  "You're not too busy to call new leads. You're too comfortable.",
  "Every lead deserves five minutes of your time. Start giving it.",
  "Those leads have other companies calling them. Why aren't you?",
  "Your new lead queue should be at ZERO by end of day. Make it happen.",
  "Stop overthinking. Start dialing. Clear those leads.",
  "The scoreboard updates daily. So should your lead queue.",
  "New leads aren't a suggestion box. They're a to-do list.",
  "If you can't handle the leads you've been given, someone else will.",
  "The leads in your name are a test. You're currently failing.",
  "Closers call. Pretenders wait. Which one are you?",
  "I gave you leads, not homework to put off. Get after it.",
  "Your new leads should scare you -- because every minute they sit, you're losing.",
  "That lead queue is your responsibility. Own it.",
  "You think those leads are just going to wait around forever? They won't.",
  "The gap between where you are and where you want to be? It's those uncalled leads.",
  "I'm watching lead response times. Yours need work.",
  "Hit those new leads hard and fast. That's how deals get done.",
  "Your phone should be warm from dialing. Not cold from sitting.",
  "Those leads represent families who need solutions. Be the solution.",
  "A lead untouched is a lead lost. Don't lose what I gave you.",
  "You're sitting on a goldmine and complaining about the weather. DIAL.",
  "Clear the queue. Simple as that.",
  "New leads came in. Time to earn your keep.",
  "While you wait, someone else is closing your lead. Think about that.",
  "Your lead queue is a reflection of your work ethic. What's it saying?",
  "The phones work both ways. Start using yours.",
  "Those leads have a shelf life. And it's shorter than you think.",
  "I can reassign those leads with one click. Don't make me do it.",
  "You got leads, you got opportunity. Stop wasting both.",
  "The only thing between you and a commission check is a phone call. Make it.",
  "Leads in. Calls out. Revenue up. It's not complicated.",
  "Your new lead count should give you urgency, not comfort.",
  "Act like every lead is your last one. Because eventually, they will be.",
  "Untouched leads tell me everything I need to know about your day.",
  "You've got leads piling up. That's not a flex. That's a problem.",
  "Be the agent that clears their queue first. Not the one who clears it last.",
  "Those leads cost us money to get. Your job is to turn them into revenue.",
  "If your lead response time was a grade, you'd be failing right now.",
  "Every new lead is someone raising their hand saying 'I need help.' Help them.",
  "Your leads are waiting. Your commission is waiting. What are YOU waiting for?",
  "I don't care what else is on your plate. New leads come first. Always.",
  "The difference between a $5K month and a $15K month is lead response time.",
  "Start treating new leads like emergencies. Because they are.",
  "You want more leads? Show me you can handle the ones you have.",
  "Your new lead count is climbing. Your credibility is dropping. Fix it.",
  "The #1 killer of sales careers is letting leads go cold. Don't be a statistic.",
  "Every hour you wait, the homeowner talks to another company. CALL NOW.",
  "Your lead queue isn't a parking lot. Stop parking leads and start moving them.",
  "I'm seeing a gap between your leads assigned and your calls made. Close that gap.",
  "The market doesn't wait. Your leads don't wait. Why are you waiting?",
  "Stop scrolling and start scrolling through your lead list instead.",
  "I need those leads hot or I need them gone. Your call.",
  "A new lead is a loaded gun. Point it at revenue and pull the trigger.",
  "You're stockpiling leads like they appreciate in value. They don't. They die.",
  "If I have to remind you to call your leads, we have a bigger problem.",
  "You have leads people would fight over. Don't take them for granted.",
  "Dial for dollars. Those new leads are the dollars.",
  "The top agent on this team? Their new lead count is always zero. Be like them.",
  "New leads are your lifeline. Stop letting the rope go slack.",
  "I need activity. I need calls. I need those leads contacted. Today.",
  "Your new leads have names. They have families. They have roofing problems. HELP THEM.",
  "Nobody ever got rich by ignoring opportunity. Your leads are opportunity.",
  "Speed wins. Always. Call those leads before someone else does.",
  "The lead queue is not a savings account. It has zero interest and 100% depreciation.",
  "I'm tracking new lead response and yours is slipping. Step it up.",
  "You've got fresh leads. That's the dream. Now wake up and work them.",
  "Don't tell me you're hungry when your leads are starving for attention.",
  "Those leads are oxygen for your pipeline. Don't suffocate your own business.",
  "You want the big months? They start with calling every single new lead immediately.",
  "Your lead queue isn't going to manage itself. Neither is your career.",
  "Untouched leads today = missed rent tomorrow. Think about it.",
  "I assigned you leads because you're capable. Prove it wasn't a mistake.",
  "Show me zero new leads at end of day and I'll show you a future top earner.",
  "The phone is lighter than your excuses. Pick it up.",
  "If you're not calling new leads within the hour, you're already behind.",
  "Those leads are someone's leaking roof, broken gutter, aging siding. They need you NOW.",
  "New leads are free money sitting on a table. Go pick it up.",
  "Other agents wish they had your leads. Act like you appreciate them.",
  "Your new leads are rotting. That's not dramatic. That's a fact.",
  "I'm not asking you to move mountains. I'm asking you to make phone calls.",
  "The sales floor rewards action. Your lead queue needs action. Connect the dots.",
  "If I gave those leads to your competition, they'd call within 30 seconds. Beat that.",
  "Stop treating your lead queue like a someday list. It's a RIGHT NOW list.",
  "Every lead in your queue is someone else's mortgage payment waiting to happen.",
  "You've got new leads. Translation: you've got no excuse for a slow day.",
  "The fastest way to earn trust around here is to clear your leads quickly.",
  "I'm handing you money. All you have to do is dial the number. What's the holdup?",
  "New leads = new conversations = new deals = new money. Get the chain started.",
  "You can't build a pipeline with leads sitting in a queue. Move them forward.",
  "Your lead queue looks like rush hour traffic. Time to clear the road.",
  "The agents who call first close first. The ones who wait close never.",
  "I don't need reasons. I need those leads contacted.",
  "Homeowners don't care about your schedule. They care about their problem. Call them.",
  "A lead sitting in your name is a bet I made on you. Don't lose my bet.",
  "You want the top spot? It starts with zero tolerance for unworked leads.",
  "Those leads are today's opportunity. Not tomorrow's. Not next week's. TODAY'S.",
  "I'd rather see you fail on a call than not make the call at all.",
  "Your leads are aging faster than your excuses. One of them needs to stop.",
  "Show me your lead queue at zero and I'll show you your next promotion.",
  "Every unworked lead tells a homeowner that we don't care. We DO care. Call them.",
  "You're leaving bread on the table and wondering why you're hungry. CALL YOUR LEADS.",
  "The only acceptable number of new leads at end of day is zero.",
  "I hand you money. You hand me results. That's the deal. Now call your leads.",
  "Your lead response time is a direct measure of how much you want this.",
  "Those new leads are someone else's closed deal if you don't act fast.",
  "The leaderboard favors the fast. Your leads are begging you to be fast.",
  "You've got leads. You've got a phone. You've got time. No more excuses.",
  "If your leads could fire you, they would have by now. Don't give me a reason to agree.",
  "A new lead is a ticking clock. Every tick is trust draining away.",
  "The market gave us leads. I gave them to you. Now do your job.",
  "Your new lead count is a problem only you can solve. Solve it.",
  "Letting leads sit is like letting gas leak. Eventually, something blows up.",
  "You don't get paid for having leads. You get paid for working leads.",
  "Those uncontacted leads are costing you money every single minute.",
  "I need warriors, not waiters. Attack those leads.",
  "Your lead queue is your to-do list. Get to-doing.",
  "Every new lead is a chance to be someone's hero. Be the hero.",
  "I've seen your potential. I've seen your leads. Now I need to see the calls.",
  "The fastest agent on this team calls leads within 60 seconds. Where are you?",
  "Don't sit on opportunity. Jump on it. Call those leads.",
  "The best day to clear your leads was yesterday. The second best day is today.",
  "I'm running a sales floor, not a storage unit. Clear those leads out.",
  "Those leads have names and numbers. Use the numbers to call the names.",
  "A stack of unworked leads is a stack of missed paychecks. Clear the stack.",
  "You're not behind on calls. You're behind on money. Fix it.",
  "New leads are a test of discipline. Pass the test. Call them all.",
  "The top earners on this team never have new leads sitting. Take notes.",
  "I shouldn't know your new lead count. It should already be zero.",
  "Your leads are getting old enough to drive. Call them before they drive to your competitor.",
  "Every lead you don't call today becomes twice as hard to close tomorrow.",
  "If your lead queue is full, your schedule should be too. Make it match.",
  "Stop managing your leads. Start attacking your leads.",
  "The phone doesn't bite. Your leads won't either. DIAL.",
  "I gave you opportunities. I'm waiting for you to do something with them.",
  "New lead comes in, phone goes to ear. That's the only workflow.",
  "Your lead queue says more about your day than any status update could.",
  "Those leads are freshest right now. Call them while they're fresh.",
  "You're sitting on more opportunity than most people see in a month. ACT ON IT.",
  "If you called every lead the day it came in, you'd be #1 on this board. Start today.",
  "Don't make me come find you. Just clear your leads.",
  "Those homeowners are sitting by their phone. The question is whether you'll call or the other company will.",
  "New leads are the lifeblood of your business. Don't let them bleed out.",
  "You were hired to close. You can't close what you won't call. Get dialing.",
  "Your new leads are screaming 'CALL ME!' Can you hear them? Because I can.",
  "I don't need perfect pitches. I need phone calls. Clear those leads.",
  "Your lead count just showed up in my reports. Trust me, you want to fix this before our 1-on-1.",
  "If you cleared every new lead today, tomorrow's pipeline would thank you.",
  "A hungry agent has zero new leads at noon. How hungry are you?",
  "Stop waiting for the perfect moment. The perfect moment was when the lead came in.",
  "You want time off? Clear your leads first. You want a bonus? Clear your leads first.",
  "I can tell who's working and who's not by looking at new lead counts. Can you guess what yours tells me?",
  "Your future commission check starts with a call to those new leads right now.",
  "The lead doesn't know you're behind. All they know is nobody called. Fix that.",
  "One call. That's all it takes to start a deal. Make one call. Then make another.",
  "Stop treating your lead queue like a nice-to-have. It's a MUST-do.",
  "You didn't get into sales to watch leads sit. You got in to close deals. Start.",
  "Every lead sitting in your name is a dollar bill on fire. Stop watching it burn.",
  "I want zero new leads in your name by end of day. No exceptions.",
  "The gap between good agents and great agents? Great agents clear their leads first thing.",
  "Your leads are waiting. Your commission is waiting. The only thing not waiting is your competition.",
  "The homeowner doesn't know they're a lead. They just know nobody called. Change that.",
  "I'm watching queues. I'm watching results. Right now your queue is louder than your results.",
  "Leads come in hot. Every hour you wait, they cool 10 degrees. Don't let them freeze.",
  "One phone call could change someone's day. And yours. Make it.",
  "Do you know what separates you from a fat commission check? Those unworked leads. Remove the barrier.",
  "A lead in your queue longer than 24 hours is embarrassing. I shouldn't have to say this.",
  "The fastest path from where you are to where you want to be goes straight through your new leads.",
  "Don't let those leads define you as the agent who doesn't follow up. Call every single one.",
  "Right now someone needs a roof, a quote, an answer. You have their number. CALL THEM.",
];

function getRandomDmMessage() {
  return DM_MESSAGES[Math.floor(Math.random() * DM_MESSAGES.length)];
}

/**
 * Post new lead accountability check to #accountability and DM agents with leads sitting.
 * @param {Client} client - Discord client
 * @param {string} channelId - Accountability channel ID
 * @param {string} title - 'MIDDAY NEW LEAD CHECK' or 'END OF DAY NEW LEAD CHECK'
 */
async function runNewLeadCheck(client, channelId, title = 'NEW LEAD CHECK') {
  try {
    const agents = getActiveAgents().filter(a => a.team !== 'admin');
    const stats = await notionStats.getAllAgentNewLeads(agents, 7);

    if (stats.length === 0) return;

    const channel = await client.channels.fetch(channelId);
    if (!channel) return;

    const totalNewLeads = stats.reduce((sum, a) => sum + a.newLeadCount, 0);

    const lines = stats.map(a => {
      let emoji;
      if (a.newLeadCount === 0) emoji = '\u{1F7E2}';
      else if (a.newLeadCount <= 2) emoji = '\u{1F7E1}';
      else emoji = '\u{1F534}';

      const mention = a.discordId ? `<@${a.discordId}>` : a.name;
      return `${emoji} ${mention} -- **${a.newLeadCount}** new leads sitting`;
    });

    const behindAgents = stats.filter(a => a.newLeadCount >= 3);
    let footer = '';
    if (behindAgents.length > 0) {
      const mentions = behindAgents
        .map(a => a.discordId ? `<@${a.discordId}>` : a.name)
        .join(' ');
      footer = `\n\n${mentions} -- Clear those leads NOW!`;
    }

    const embed = new EmbedBuilder()
      .setColor(0xe74c3c)
      .setTitle(`\u{1F4CB} ${title} \u{1F4CB}`)
      .setDescription(lines.join('\n') + footer)
      .addFields(
        { name: 'Team Total', value: `**${totalNewLeads}** new leads sitting across the team`, inline: false },
        { name: 'Target', value: '0 new leads -- clear them all, every day', inline: false },
      )
      .setTimestamp();

    await channel.send({ content: '@everyone', embeds: [embed] });

    // DM agents who have new leads sitting (1 or more)
    for (const agent of stats) {
      if (agent.newLeadCount === 0 || !agent.discordId) continue;

      try {
        const user = await client.users.fetch(agent.discordId);
        const randomMsg = getRandomDmMessage();

        const dmEmbed = new EmbedBuilder()
          .setColor(0xe74c3c)
          .setTitle('\u{1F6A8} NEW LEAD ALERT \u{1F6A8}')
          .setDescription(
            `**${agent.name}**, you have **${agent.newLeadCount}** new lead${agent.newLeadCount === 1 ? '' : 's'} sitting in your name right now.\n\n` +
            `*"${randomMsg}"*\n\n` +
            `Get those leads contacted and moved out of "New" status. No excuses.`
          )
          .setTimestamp();

        await user.send({ embeds: [dmEmbed] });
        await new Promise(r => setTimeout(r, 1000));
      } catch (dmErr) {
        console.error(`[NewLeadCheck] Could not DM ${agent.name}:`, dmErr.message);
      }
    }

    console.log(`[NewLeadCheck] Posted ${title}: ${totalNewLeads} total new leads, ${stats.filter(a => a.newLeadCount > 0).length} agents DM'd`);
  } catch (err) {
    console.error('[NewLeadCheck] Error:', err.message);
  }
}

module.exports = { runNewLeadCheck };
