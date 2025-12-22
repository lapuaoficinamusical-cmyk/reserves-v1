/* --- CONFIG --- */
const PRICE_PER_HOUR=8, MIN_CELLS=2, MAX_CELLS=6, MAX_HOURS_MONTH=10;
const TIMES=[];
for(let h=9;h<21;h++){ TIMES.push(`${String(h).padStart(2,"0")}:00`); TIMES.push(`${String(h).padStart(2,"0")}:30`); }

const festiusCatalunya=["2026-01-01","2026-01-06","2026-04-03","2026-04-06","2026-05-01","2026-06-24","2026-08-15","2026-09-11","2026-10-12","2026-12-08","2026-12-25","2026-12-26","2026-03-03","2026-06-29"];

let selectedBuc=null, selectedDate=null, startCell=null, endCell=null;
let month=new Date().getMonth(), year=new Date().getFullYear();
let cart=[];

/* ELEMENTS */
const bucEls=document.querySelectorAll(".buc");
const calendar=document.getElementById("calendar");
const calendarHeader=document.getElementById("calendarHeader");
const monthLabel=document.getElementById("monthLabel");
const slotsEl=document.getElementById("slots");
const selection=document.getElementById("selection");
const rangeText=document.getElementById("rangeText");
const cartText=document.getElementById("cartText");
const addCartBtn=document.getElementById("addCart");
const checkout=document.getElementById("checkout");
const nameInput=document.getElementById("name");
const emailInput=document.getElementById("email");
const confirmBtn=document.getElementById("confirm");
const summary=document.getElementById("summary");
const durationEl=document.getElementById("duration");
const priceEl=document.getElementById("price");

/* MODAL */
const introModal=document.getElementById("introModal");
const closeIntro=document.getElementById("closeIntro");
introModal.style.display="flex";
closeIntro.addEventListener("click",()=>{ introModal.style.display="none"; });

/* TRIA BUC */
bucEls.forEach(el=>{
  el.onclick=()=>{
    bucEls.forEach(x=>x.classList.remove("selected"));
    el.classList.add("selected");
    selectedBuc=el.dataset.buc;
    if(selectedDate) renderSlots();
  }
});

/* CALENDARI */
function isDisabledDate(y,m,d){
  const dateStr=`${y}-${m+1}-${d}`;
  const day=new Date(y,m,d).getDay();
  return day===0||festiusCatalunya.includes(dateStr);
}
function buildCalendar(){
  calendar.innerHTML=""; calendarHeader.innerHTML="";
  const dayNames=["Dl","Dm","Dc","Dj","Dv","Ds","Dg"];
  dayNames.forEach(d=>{ const el=document.createElement("div"); el.textContent=d; calendarHeader.appendChild(el); });
  const names=["Gener","Febrer","Març","Abril","Maig","Juny","Juliol","Agost","Setembre","Octubre","Novembre","Desembre"];
  monthLabel.textContent=`${names[month]} ${year}`;
  const daysInMonth=new Date(year,month+1,0).getDate();
  const firstDay=new Date(year,month,1).getDay();
  const offset=firstDay===0?6:firstDay-1;
  for(let i=0;i<offset;i++){ const empty=document.createElement("div"); empty.className="day empty"; calendar.appendChild(empty); }
  for(let d=1; d<=daysInMonth; d++){
    const el=document.createElement("div"); el.className="day"; el.textContent=d;
    if(isDisabledDate(year,month,d)) el.classList.add("disabled");
    else el.onclick=()=>{
      selectedDate=`${year}-${month+1}-${d}`;
      document.querySelectorAll(".day").forEach(x=>x.classList.remove("selected"));
      el.classList.add("selected");
      if(selectedBuc) renderSlots();
    };
    calendar.appendChild(el);
  }
}

/* STORAGE */
function key(){ return selectedBuc+"_"+selectedDate; }
function getRes(){ return JSON.parse(localStorage.getItem(key())||"[]"); }
function saveRes(r){ localStorage.setItem(key(),JSON.stringify(r)); }

/* CART */
function totalHoursInMonth(y,m){ return cart.reduce((sum,c)=>{const cd=new Date(c.date);return(cd.getFullYear()===y&&cd.getMonth()===m?sum+c.dur:sum);},0); }
function totalHoursInDay(dateStr){ return cart.reduce((sum,c)=>c.date===dateStr?sum+c.dur:sum,0); }

/* FRANGES */
function renderSlots(){
  slotsEl.innerHTML=""; startCell=endCell=null; selection.classList.add("hidden");
  if(!selectedBuc||!selectedDate) return;
  const reserved=getRes();
  for(let i=0;i<TIMES.length-1;i++){
    const el=document.createElement("div"); el.textContent=`${TIMES[i]} – ${TIMES[i+1]}`; el.className="slot";
    if(reserved.includes(TIMES[i])||cart.some(c=>c.date===selectedDate&&c.buc===selectedBuc&&i>=c.startCell&&i<=c.endCell)) el.classList.add("busy");
    else el.onclick=()=>selectStart(i);
    slotsEl.appendChild(el);
  }
  updateCartText();
}
function selectStart(i){
  startCell=i; endCell=i+MIN_CELLS-1; updateSelection();
  const slotsEls=document.querySelectorAll(".slot"); const reserved=getRes();
  for(let j=startCell;j<startCell+MAX_CELLS&&j<TIMES.length-1;j++){
    if(reserved.includes(TIMES[j])) break;
    slotsEls[j].onclick=()=>{const newEnd=j,length=newEnd-startCell,newHours=length/2,cDate=new Date(selectedDate);
      if(length>=MIN_CELLS&&length<=MAX_CELLS){
        if(totalHoursInMonth(cDate.getFullYear(),cDate.getMonth())+newHours>MAX_HOURS_MONTH){alert("No pots superar 10h en aquest mes.");return;}
        if(totalHoursInDay(selectedDate)+newHours>3){alert("No pots reservar més de 3h en aquest dia.");return;}
        endCell=newEnd; updateSelection();
      }
    };
  }
}
function updateSelection(){
  document.querySelectorAll(".slot").forEach((el,i)=>{
    el.classList.remove("selected"); 
    if(startCell!==null&&endCell!==null&&i>=startCell&&i<=endCell) el.classList.add("selected");
  });
  if(startCell!==null&&endCell!==null){
    const dur=(endCell-startCell+1)/2;
    rangeText.textContent=`Des de ${TIMES[startCell]} fins ${TIMES[endCell+1]} (Durada: ${dur} h)`;
    selection.classList.remove("hidden");
  }
}

/* ADD CART */
addCartBtn.onclick = () => {
  if(startCell===null||endCell===null) return;
  const dur=(endCell-startCell+1)/2; const cDate=new Date(selectedDate);
  if(totalHoursInDay(selectedDate)+dur>3){alert("No pots reservar més de 3h en aquest dia.");return;}
  if(totalHoursInMonth(cDate.getFullYear(),cDate.getMonth())+dur>MAX_HOURS_MONTH){alert("No pots superar 10h en aquest mes.");return;}
  
  cart.push({buc:selectedBuc,date:selectedDate,startCell,endCell,dur});
  startCell=endCell=null; renderSlots(); selection.classList.add("hidden");
  updateCartText();
  checkout.classList.remove("hidden");
}

/* UPDATE CART */
function updateCartText(){
  cartText.innerHTML=""; 
  if(cart.length===0){cartText.textContent="Carret buit"; summary.classList.add("hidden"); checkout.classList.add("hidden"); return;}
  cart.forEach((c,index)=>{
    const div=document.createElement("div");
    div.className="cart-item";
    const txt=document.createElement("span");
    txt.className="cart-item__text";
    txt.textContent=`Buc ${c.buc} - ${c.date} de ${TIMES[c.startCell]} a ${TIMES[c.endCell+1]} (${c.dur} h)`;
    div.appendChild(txt);
    const btn=document.createElement("button");
    btn.className="button button--danger button--small";
    btn.textContent="Eliminar";
    btn.onclick=()=>{cart.splice(index,1); renderSlots(); updateCartText();};
    div.appendChild(btn);
    cartText.appendChild(div);
  });
  const total=cart.reduce((sum,c)=>sum+c.dur,0); 
  priceEl.textContent=`Preu total: ${total*PRICE_PER_HOUR} €`; 
  durationEl.textContent=`Total hores seleccionades: ${total} h`; 
  summary.classList.remove("hidden");
}

/* CONFIRMAR */
confirmBtn.onclick=()=>{
  if(cart.length===0){alert("Carret buit!");return;}
  if(!nameInput.value||!emailInput.value){alert("Omple nom i correu");return;}
  cart.forEach(c=>{
    const reserved=getRes();
    for(let i=c.startCell;i<=c.endCell;i++) reserved.push(TIMES[i]);
    saveRes(reserved);
  });
  alert(`Reserva confirmada per ${nameInput.value} (${emailInput.value})`);
  cart=[]; startCell=endCell=null; nameInput.value=""; emailInput.value=""; checkout.classList.add("hidden"); renderSlots();
}

/* NAV CALENDARI */
document.getElementById("prev").onclick=()=>{month--; if(month<0){month=11; year--;} buildCalendar();};
document.getElementById("next").onclick=()=>{month++; if(month>11){month=0; year++;} buildCalendar();};

/* INIT */
buildCalendar();
