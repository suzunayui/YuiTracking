// Draws every motion setting into one wide image for sharing. Windows and Mac send the same card.
export const CARD_WIDTH=1600,CARD_COLUMNS=3;
const PADDING=48,COLUMN_GAP=36,HEADER=112,SECTION_TITLE=46,ROW=42,SECTION_GAP=26,FOOTER=24;
const FONT='"Yu Gothic UI","Hiragino Sans","Noto Sans CJK JP",sans-serif';

const sectionHeight=section=>SECTION_TITLE+section.rows.length*ROW;

// Keeps the panel's order and starts a new column once a column reaches its share of the height.
export function cardLayout(sections){
 const heights=sections.map(sectionHeight);
 const total=heights.reduce((sum,height)=>sum+height+SECTION_GAP,0);
 const columns=Array.from({length:CARD_COLUMNS},()=>[]);
 let index=0,used=0;
 sections.forEach((section,i)=>{
  const height=heights[i]+SECTION_GAP,remaining=total-heights.slice(0,i).reduce((sum,item)=>sum+item+SECTION_GAP,0);
  const share=remaining/(CARD_COLUMNS-index);
  if(used>0&&index<CARD_COLUMNS-1&&used+height/2>share){index++;used=0;}
  columns[index].push(section);used+=height;
 });
 const tallest=Math.max(0,...columns.map(column=>column.reduce((sum,section)=>sum+sectionHeight(section)+SECTION_GAP,0)));
 return {columns,height:HEADER+tallest+FOOTER+PADDING};
}

function elided(context,text,width){
 if(context.measureText(text).width<=width)return text;
 let cut=text.length;
 while(cut>1&&context.measureText(text.slice(0,cut)+'…').width>width)cut--;
 return text.slice(0,cut)+'…';
}

export function drawSettingsCard(canvas,card){
 const {columns,height}=cardLayout(card.sections);
 canvas.width=CARD_WIDTH;canvas.height=height;
 const context=canvas.getContext('2d');
 context.fillStyle='#10121B';context.fillRect(0,0,CARD_WIDTH,height);
 context.textBaseline='middle';
 context.textAlign='left';context.fillStyle='#F4F4FA';context.font=`700 36px ${FONT}`;
 context.fillText(card.title,PADDING,PADDING+14);
 if(card.preset){
  context.textAlign='right';context.fillStyle='#9DA7C0';context.font=`24px ${FONT}`;
  context.fillText(elided(context,card.preset,CARD_WIDTH/2),CARD_WIDTH-PADDING,PADDING+14);
 }
 const columnWidth=(CARD_WIDTH-PADDING*2-COLUMN_GAP*(CARD_COLUMNS-1))/CARD_COLUMNS;
 columns.forEach((column,index)=>{
  const x=PADDING+index*(columnWidth+COLUMN_GAP);
  let y=HEADER;
  for(const section of column){
   context.fillStyle='#171B27';
   context.beginPath();context.roundRect(x,y,columnWidth,sectionHeight(section),10);context.fill();
   context.textAlign='left';context.fillStyle='#F4F4FA';context.font=`700 24px ${FONT}`;
   context.fillText(section.title,x+18,y+SECTION_TITLE/2+2);
   let rowY=y+SECTION_TITLE;
   for(const row of section.rows){
    const middle=rowY+ROW/2-3;
    context.font=`700 23px ${FONT}`;
    const value=row.off?'OFF':row.value;
    const valueWidth=context.measureText(value).width;
    context.textAlign='right';context.fillStyle=row.off?'#6F7890':'#8FC7FF';
    context.fillText(value,x+columnWidth-18,middle);
    context.textAlign='left';context.fillStyle=row.off?'#6F7890':'#C9D0E0';context.font=`22px ${FONT}`;
    context.fillText(elided(context,row.label,columnWidth-36-valueWidth-14),x+18,middle);
    rowY+=ROW;
   }
   y+=sectionHeight(section)+SECTION_GAP;
  }
 });
 return canvas;
}
